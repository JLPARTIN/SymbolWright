import { createHash, randomUUID } from 'node:crypto'

import {
  capabilityRiskLevel,
  isHighRiskCapability,
  isKnownCapability,
} from './access-capability-catalog.js'
import { matchesAnyRepositoryPattern } from './access-branch-match.js'
import {
  SANDBOX_OFFLINE_EXECUTE_CAPABILITY,
  canonicalSandboxCapabilityId,
  sandboxCapabilityAliases,
} from './sandbox-capabilities.js'
import { checkBranchScope as checkBranchScopeViolation } from './branch-scope-guard.js'
import type { AccessStore } from './access-store.js'
import type {
  AgentAccessGrant,
  ApprovalRequest,
  ApprovalRequirement,
  AuditEvent,
  RiskLevel,
} from './access-types.js'

export interface AuthorizationRequest {
  readonly principalId: string
  readonly grantId: string
  readonly sessionId?: string
  readonly capability: string
  readonly repository?: string
  readonly organization?: string
  readonly branch?: string
  readonly isDefaultBranch?: boolean
  readonly missionId?: string
  readonly toolName?: string
  readonly metadata?: Record<string, unknown>
  readonly correlationId?: string
}

export interface AuthorizationDecision {
  readonly allowed: boolean
  readonly reasonCode: string
  readonly reason: string
  readonly requiresApproval: boolean
  readonly approvalId?: string
  readonly evaluatedPolicies: readonly string[]
  readonly grantVersion: number
  readonly riskLevel: RiskLevel
  readonly correlationId: string
}

export class AuthorizationDeniedError extends Error {
  public constructor(public readonly decision: AuthorizationDecision) {
    super(`authorization_denied[${decision.reasonCode}]: ${decision.reason}`)
  }
}

export class ApprovalRequiredError extends Error {
  public constructor(public readonly decision: AuthorizationDecision) {
    super(`approval_required[${decision.reasonCode}]: ${decision.reason}`)
  }
}

export class ApprovalNotFoundError extends Error {}
export class ApprovalStateError extends Error {}

const BRANCH_SENSITIVE_CAPABILITIES: ReadonlySet<string> = new Set([
  'repo.branch.create',
  'repo.branch.update',
  'repo.branch.delete',
  'repo.content.create',
  'repo.content.update',
  'repo.content.delete',
  'repo.commit.create',
  'repo.commit.push',
  'repo.pull_request.create',
  'symbolwright.checkpoint.restore',
])

function isBranchSensitiveCapability(capability: string): boolean {
  return BRANCH_SENSITIVE_CAPABILITIES.has(capability)
}

function sandboxPolicyVersionsFromRequest(
  request: AuthorizationRequest,
): Readonly<Record<string, number>> | undefined {
  const value = request.metadata?.['sandboxPolicyVersions']
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const entries = Object.entries(value as Record<string, unknown>)
  if (
    !entries.every(
      ([key, version]) =>
        key.length > 0 &&
        typeof version === 'number' &&
        Number.isSafeInteger(version) &&
        version > 0,
    )
  ) {
    return undefined
  }
  return Object.fromEntries(entries) as Readonly<Record<string, number>>
}

function policyVersionsMatch(
  expected: Readonly<Record<string, number>> | undefined,
  actual: Readonly<Record<string, number>> | undefined,
): boolean {
  if (expected === undefined || actual === undefined) return expected === actual
  const expectedEntries = Object.entries(expected).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  const actualEntries = Object.entries(actual).sort(([left], [right]) => left.localeCompare(right))
  return JSON.stringify(expectedEntries) === JSON.stringify(actualEntries)
}

function approvalMatchesCurrentAuthority(
  approval: ApprovalRequest,
  grant: AgentAccessGrant,
  request: AuthorizationRequest,
): boolean {
  if (approval.grantVersion !== undefined && approval.grantVersion !== grant.version) return false
  return policyVersionsMatch(approval.policyVersions, sandboxPolicyVersionsFromRequest(request))
}

function decision(
  partial: Omit<AuthorizationDecision, 'correlationId' | 'evaluatedPolicies'> & {
    evaluatedPolicies?: readonly string[]
  },
  correlationId: string,
): AuthorizationDecision {
  return {
    ...partial,
    evaluatedPolicies: partial.evaluatedPolicies ?? [],
    correlationId,
  }
}

function boundOperationKey(request: AuthorizationRequest): string {
  const policyVersions = sandboxPolicyVersionsFromRequest(request)
  const serializedPolicyVersions =
    policyVersions === undefined
      ? ''
      : JSON.stringify(
          Object.entries(policyVersions).sort(([left], [right]) => left.localeCompare(right)),
        )
  const parts = [
    request.grantId,
    canonicalSandboxCapabilityId(request.capability),
    request.repository ?? '',
    request.branch ?? '',
    request.missionId ?? '',
    serializedPolicyVersions,
  ]
  return createHash('sha256').update(parts.join('\u0001')).digest('hex')
}

function matchApprovalRequirement(
  grant: AgentAccessGrant,
  capability: string,
): ApprovalRequirement {
  const rules = grant.approvalPolicy.rules
  const aliases = sandboxCapabilityAliases(capability)
  const exact = rules.find((rule) => aliases.includes(rule.match))
  if (exact !== undefined) return exact.requirement
  const canonicalCapability = canonicalSandboxCapabilityId(capability)
  if (isHighRiskCapability(canonicalCapability)) {
    const highRisk = rules.find((rule) => rule.match === 'high-risk')
    if (highRisk !== undefined) return highRisk.requirement
  }
  const wildcard = rules.find((rule) => rule.match === '*')
  return wildcard?.requirement ?? 'every-high-risk-operation'
}

export class AuthorizationService {
  public constructor(private readonly store: AccessStore) {}

  public async evaluate(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    const correlationId = request.correlationId ?? randomUUID()
    const evaluatedPolicies: string[] = []
    const result = this.evaluateInternal(request, correlationId, evaluatedPolicies)
    this.recordAudit(request, result)
    return result
  }

  public async requireAuthorized(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    const result = await this.evaluate(request)
    if (result.requiresApproval) throw new ApprovalRequiredError(result)
    if (!result.allowed) throw new AuthorizationDeniedError(result)
    return result
  }

  /**
   * The operator-facing completion of a pending approval created by `checkApprovalPolicy` — the
   * only supported production route for turning `requiresApproval: true` into a decision. Approving
   * does not itself authorize the original operation: the next matching request re-evaluates policy
   * and consumes this record via the bound-operation-key check in `checkApprovalPolicy`.
   */
  public decideApproval(
    grantId: string,
    approvalId: string,
    outcome: 'approved' | 'denied',
    actor: string,
    operatorComment?: string,
  ): ApprovalRequest {
    const approval = this.store.readApproval(approvalId)
    if (approval === undefined || approval.grantId !== grantId) {
      throw new ApprovalNotFoundError(`No such approval request: ${approvalId}`)
    }

    const now = new Date()
    if (approval.status !== 'pending') {
      throw new ApprovalStateError(`Approval request is already ${approval.status}.`)
    }
    if (new Date(approval.expiresAt).getTime() <= now.getTime()) {
      this.store.writeApproval({ ...approval, status: 'expired' })
      throw new ApprovalStateError('Approval request has expired.')
    }

    const updated: ApprovalRequest = {
      ...approval,
      status: outcome,
      approverId: actor,
      decidedAt: now.toISOString(),
      ...(operatorComment === undefined ? {} : { operatorComment }),
    }
    this.store.writeApproval(updated)
    this.store.appendAuditEvent({
      id: randomUUID(),
      type: outcome === 'approved' ? 'approval.approved' : 'approval.denied',
      timestamp: now.toISOString(),
      grantId,
      capability: approval.capability,
      approvalId,
      ...(approval.repository === undefined ? {} : { repository: approval.repository }),
      ...(approval.branch === undefined ? {} : { branch: approval.branch }),
      ...(approval.missionId === undefined ? {} : { missionId: approval.missionId }),
      metadata: { actor },
    })
    return updated
  }

  public listApprovalsForGrant(grantId: string): readonly ApprovalRequest[] {
    return this.store.listApprovalsForGrant(grantId)
  }

  private evaluateInternal(
    request: AuthorizationRequest,
    correlationId: string,
    evaluatedPolicies: string[],
  ): AuthorizationDecision {
    const canonicalCapability = canonicalSandboxCapabilityId(request.capability)
    const riskLevel = capabilityRiskLevel(canonicalCapability) ?? 'critical'

    evaluatedPolicies.push('capability-known')
    if (!isKnownCapability(canonicalCapability)) {
      return decision(
        {
          allowed: false,
          reasonCode: 'UNKNOWN_CAPABILITY',
          reason: `Unknown capability "${request.capability}" is refused by default.`,
          requiresApproval: false,
          grantVersion: 0,
          riskLevel,
          evaluatedPolicies,
        },
        correlationId,
      )
    }

    evaluatedPolicies.push('grant-lookup')
    const grant = this.store.readGrant(request.grantId)
    if (grant === undefined) {
      return decision(
        {
          allowed: false,
          reasonCode: 'GRANT_NOT_FOUND',
          reason: 'No such access grant.',
          requiresApproval: false,
          grantVersion: 0,
          riskLevel,
          evaluatedPolicies,
        },
        correlationId,
      )
    }

    evaluatedPolicies.push('principal-match')
    if (grant.principalId !== request.principalId) {
      return decision(
        {
          allowed: false,
          reasonCode: 'PRINCIPAL_MISMATCH',
          reason: 'The presented credential does not belong to this principal.',
          requiresApproval: false,
          grantVersion: grant.version,
          riskLevel,
          evaluatedPolicies,
        },
        correlationId,
      )
    }

    evaluatedPolicies.push('grant-status')
    const statusDecision = this.checkGrantStatus(grant, correlationId, riskLevel, evaluatedPolicies)
    if (statusDecision !== undefined) return statusDecision

    evaluatedPolicies.push('capability-membership')
    const capabilityDecision = this.checkCapabilityMembership(
      grant,
      request.capability,
      correlationId,
      riskLevel,
      evaluatedPolicies,
    )
    if (capabilityDecision !== undefined) return capabilityDecision

    evaluatedPolicies.push('execution-limits')
    const executionLimitsDecision = this.checkExecutionLimits(
      grant,
      request,
      correlationId,
      riskLevel,
      evaluatedPolicies,
    )
    if (executionLimitsDecision !== undefined) return executionLimitsDecision

    if (request.repository !== undefined) {
      evaluatedPolicies.push('repository-scope')
      const repoDecision = this.checkRepositoryScope(
        grant,
        request.repository,
        correlationId,
        riskLevel,
        evaluatedPolicies,
      )
      if (repoDecision !== undefined) return repoDecision
    }

    if (request.branch !== undefined && isBranchSensitiveCapability(request.capability)) {
      evaluatedPolicies.push('branch-scope')
      const branchDecision = this.checkBranchScope(
        grant,
        request,
        correlationId,
        riskLevel,
        evaluatedPolicies,
      )
      if (branchDecision !== undefined) return branchDecision
    }

    evaluatedPolicies.push('approval-policy')
    return this.checkApprovalPolicy(grant, request, correlationId, riskLevel, evaluatedPolicies)
  }

  private checkGrantStatus(
    grant: AgentAccessGrant,
    correlationId: string,
    riskLevel: RiskLevel,
    evaluatedPolicies: string[],
  ): AuthorizationDecision | undefined {
    const now = new Date()
    if (grant.status === 'revoked') {
      return decision(
        {
          allowed: false,
          reasonCode: 'GRANT_REVOKED',
          reason: 'This access grant has been revoked.',
          requiresApproval: false,
          grantVersion: grant.version,
          riskLevel,
          evaluatedPolicies,
        },
        correlationId,
      )
    }
    if (grant.status === 'paused') {
      return decision(
        {
          allowed: false,
          reasonCode: 'GRANT_PAUSED',
          reason: 'This access grant is paused.',
          requiresApproval: false,
          grantVersion: grant.version,
          riskLevel,
          evaluatedPolicies,
        },
        correlationId,
      )
    }
    if (grant.status === 'pending') {
      return decision(
        {
          allowed: false,
          reasonCode: 'GRANT_NOT_ACTIVE',
          reason: 'This access grant has not been activated yet.',
          requiresApproval: false,
          grantVersion: grant.version,
          riskLevel,
          evaluatedPolicies,
        },
        correlationId,
      )
    }
    if (grant.status === 'expired' || new Date(grant.expiresAt).getTime() <= now.getTime()) {
      if (grant.status !== 'expired') {
        this.store.writeGrant({ ...grant, status: 'expired', updatedAt: now.toISOString() })
      }
      return decision(
        {
          allowed: false,
          reasonCode: 'GRANT_EXPIRED',
          reason: 'This access grant has expired.',
          requiresApproval: false,
          grantVersion: grant.version,
          riskLevel,
          evaluatedPolicies,
        },
        correlationId,
      )
    }
    if (new Date(grant.startsAt).getTime() > now.getTime()) {
      return decision(
        {
          allowed: false,
          reasonCode: 'GRANT_NOT_ACTIVE',
          reason: 'This access grant is not active yet.',
          requiresApproval: false,
          grantVersion: grant.version,
          riskLevel,
          evaluatedPolicies,
        },
        correlationId,
      )
    }
    return undefined
  }

  private checkCapabilityMembership(
    grant: AgentAccessGrant,
    capability: string,
    correlationId: string,
    riskLevel: RiskLevel,
    evaluatedPolicies: string[],
  ): AuthorizationDecision | undefined {
    const canonicalCapability = canonicalSandboxCapabilityId(capability)
    const aliases = sandboxCapabilityAliases(canonicalCapability)
    if (aliases.some((alias) => grant.deniedCapabilities.includes(alias))) {
      return decision(
        {
          allowed: false,
          reasonCode: 'CAPABILITY_DENIED',
          reason: `This agent is explicitly denied "${canonicalCapability}".`,
          requiresApproval: false,
          grantVersion: grant.version,
          riskLevel,
          evaluatedPolicies,
        },
        correlationId,
      )
    }

    const granted = aliases.some(
      (alias) =>
        grant.symbolWrightCapabilities.includes(alias) || grant.githubCapabilities.includes(alias),
    )
    if (!granted) {
      return decision(
        {
          allowed: false,
          reasonCode: 'CAPABILITY_NOT_GRANTED',
          reason: `This agent is not permitted to use "${canonicalCapability}".`,
          requiresApproval: false,
          grantVersion: grant.version,
          riskLevel,
          evaluatedPolicies,
        },
        correlationId,
      )
    }

    if (isHighRiskCapability(canonicalCapability)) {
      evaluatedPolicies.push('high-risk-explicit-selection')
    }

    return undefined
  }

  /**
   * Covers the subset of `MissionExecutionLimits` that a single point-in-time capability check can
   * enforce. The rest need state this evaluator doesn't have, so they're enforced at their own call
   * sites instead: `maxConcurrentMissions` and `requirePullRequest` at
   * `symbolwright-chat-server.ts`'s mission-create dispatch and `mission-routes.ts`'s `complete`
   * action respectively (both via `mission.grantId`, recorded at creation);
   * `maxMissionDurationMinutes` and `maxRepairAttempts` inside the autonomous mission runtime
   * (`server-autonomy-runtime.ts`), which has the elapsed-time and attempt-count state a
   * per-request check doesn't; `maxFilesChanged`/`maxDiffLines`/`maxCommits` at push time in
   * `repository-routes.ts`, against real diff/commit stats computed there. `sandboxNetworkAccess`
   * has no enforcement path yet — the sandbox itself only supports `network: none`, so the grant
   * field is a no-op today. Note: `requirePullRequest` is deliberately not treated as a push-time
   * deny even though the recommended Coding Agent profile sets `allowDirectPush: true` alongside
   * it -- the intended flow is "push to an agent branch, then open a PR," not "never push
   * directly," so it's enforced by refusing mission completion instead
   * (`require-pull-request-guard.ts`).
   */
  private checkExecutionLimits(
    grant: AgentAccessGrant,
    request: AuthorizationRequest,
    correlationId: string,
    riskLevel: RiskLevel,
    evaluatedPolicies: string[],
  ): AuthorizationDecision | undefined {
    if (
      request.capability === 'repo.commit.push' &&
      grant.executionLimits.allowDirectPush === false
    ) {
      return decision(
        {
          allowed: false,
          reasonCode: 'DIRECT_PUSH_DISABLED',
          reason:
            'This grant does not permit pushing commits directly (executionLimits.allowDirectPush is false).',
          requiresApproval: false,
          grantVersion: grant.version,
          riskLevel,
          evaluatedPolicies,
        },
        correlationId,
      )
    }

    if (canonicalSandboxCapabilityId(request.capability) === SANDBOX_OFFLINE_EXECUTE_CAPABILITY) {
      const allowedCommands = grant.executionLimits.allowedCommands
      if (allowedCommands !== undefined && allowedCommands.length > 0) {
        const command = request.metadata?.['command']
        const binary = typeof command === 'string' ? command.trim().split(/\s+/)[0] : undefined
        if (binary === undefined || !allowedCommands.includes(binary)) {
          return decision(
            {
              allowed: false,
              reasonCode: 'COMMAND_NOT_ALLOWED',
              reason:
                binary === undefined
                  ? 'This grant restricts sandbox commands to an allowlist, and no command was provided to check against it.'
                  : `Command "${binary}" is not in this grant's allowed command list.`,
              requiresApproval: false,
              grantVersion: grant.version,
              riskLevel,
              evaluatedPolicies,
            },
            correlationId,
          )
        }
      }
    }

    return undefined
  }

  private checkRepositoryScope(
    grant: AgentAccessGrant,
    repository: string,
    correlationId: string,
    riskLevel: RiskLevel,
    evaluatedPolicies: string[],
  ): AuthorizationDecision | undefined {
    const scope = grant.repositoryScope
    const org = repository.split('/')[0] ?? ''
    let inScope = false
    switch (scope.mode) {
      case 'single':
      case 'selected':
        inScope = matchesAnyRepositoryPattern(repository, scope.repositories)
        break
      case 'organization':
        inScope = scope.organizations.some((entry) => entry.toLowerCase() === org.toLowerCase())
        break
      case 'installation':
        inScope = true
        break
      case 'discovery':
        inScope = matchesAnyRepositoryPattern(repository, scope.activatedRepositories ?? [])
        break
    }

    if (!inScope) {
      return decision(
        {
          allowed: false,
          reasonCode: 'REPOSITORY_OUT_OF_SCOPE',
          reason: `Repository "${repository}" is outside this grant's repository scope.`,
          requiresApproval: false,
          grantVersion: grant.version,
          riskLevel,
          evaluatedPolicies,
        },
        correlationId,
      )
    }
    return undefined
  }

  private checkBranchScope(
    grant: AgentAccessGrant,
    request: AuthorizationRequest,
    correlationId: string,
    riskLevel: RiskLevel,
    evaluatedPolicies: string[],
  ): AuthorizationDecision | undefined {
    const violation = checkBranchScopeViolation(
      grant.branchScope,
      request.branch as string,
      request.isDefaultBranch === true,
    )
    if (violation === undefined) return undefined
    return decision(
      {
        allowed: false,
        reasonCode: violation.reasonCode,
        reason: violation.reason,
        requiresApproval: false,
        grantVersion: grant.version,
        riskLevel,
        evaluatedPolicies,
      },
      correlationId,
    )
  }

  private checkApprovalPolicy(
    grant: AgentAccessGrant,
    request: AuthorizationRequest,
    correlationId: string,
    riskLevel: RiskLevel,
    evaluatedPolicies: string[],
  ): AuthorizationDecision {
    const requirement = matchApprovalRequirement(grant, request.capability)

    if (requirement === 'denied') {
      return decision(
        {
          allowed: false,
          reasonCode: 'CAPABILITY_DENIED',
          reason: `Operator approval policy denies "${request.capability}" for this grant.`,
          requiresApproval: false,
          grantVersion: grant.version,
          riskLevel,
          evaluatedPolicies,
        },
        correlationId,
      )
    }

    if (requirement === 'none') {
      return decision(
        {
          allowed: true,
          reasonCode: 'ALLOWED',
          reason: 'Authorized.',
          requiresApproval: false,
          grantVersion: grant.version,
          riskLevel,
          evaluatedPolicies,
        },
        correlationId,
      )
    }

    const key = boundOperationKey(request)
    const existing = this.store
      .listApprovalsForGrant(grant.id)
      .find(
        (entry) =>
          entry.boundOperationKey === key &&
          entry.status === 'approved' &&
          new Date(entry.expiresAt).getTime() > Date.now() &&
          approvalMatchesCurrentAuthority(entry, grant, request),
      )

    if (existing !== undefined) {
      // Single-use: consume the approval so it cannot be replayed for a later, distinct operation.
      this.store.writeApproval({ ...existing, status: 'consumed' })
      return decision(
        {
          allowed: true,
          reasonCode: 'APPROVED',
          reason: 'Authorized via a bound operator approval.',
          requiresApproval: false,
          approvalId: existing.id,
          grantVersion: grant.version,
          riskLevel,
          evaluatedPolicies,
        },
        correlationId,
      )
    }

    const pending = this.store
      .listApprovalsForGrant(grant.id)
      .find(
        (entry) =>
          entry.boundOperationKey === key &&
          entry.status === 'pending' &&
          new Date(entry.expiresAt).getTime() > Date.now() &&
          approvalMatchesCurrentAuthority(entry, grant, request),
      )
    const approvalId = pending?.id ?? this.createPendingApproval(grant, request, key)

    return decision(
      {
        allowed: false,
        reasonCode: 'HUMAN_APPROVAL_REQUIRED',
        reason: `Operator approval (${requirement}) is required before "${request.capability}" can proceed.`,
        requiresApproval: true,
        approvalId,
        grantVersion: grant.version,
        riskLevel,
        evaluatedPolicies,
      },
      correlationId,
    )
  }

  private createPendingApproval(
    grant: AgentAccessGrant,
    request: AuthorizationRequest,
    boundKey: string,
  ): string {
    const now = new Date()
    const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const canonicalCapability = canonicalSandboxCapabilityId(request.capability)
    const policyVersions = sandboxPolicyVersionsFromRequest(request)
    const approval: ApprovalRequest = {
      id: randomUUID(),
      grantId: grant.id,
      capability: canonicalCapability,
      ...(request.repository === undefined ? {} : { repository: request.repository }),
      ...(request.branch === undefined ? {} : { branch: request.branch }),
      ...(request.missionId === undefined ? {} : { missionId: request.missionId }),
      summary: `${canonicalCapability}${request.repository ? ` on ${request.repository}` : ''}${
        request.branch ? ` (branch ${request.branch})` : ''
      }`,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      status: 'pending',
      boundOperationKey: boundKey,
      grantVersion: grant.version,
      ...(policyVersions === undefined ? {} : { policyVersions }),
    }
    this.store.writeApproval(approval)
    this.store.appendAuditEvent({
      id: randomUUID(),
      type: 'approval.requested',
      timestamp: now.toISOString(),
      grantId: grant.id,
      principalId: grant.principalId,
      capability: canonicalCapability,
      ...(request.repository === undefined ? {} : { repository: request.repository }),
      ...(request.branch === undefined ? {} : { branch: request.branch }),
      ...(request.missionId === undefined ? {} : { missionId: request.missionId }),
      approvalId: approval.id,
    })
    return approval.id
  }

  private recordAudit(request: AuthorizationRequest, result: AuthorizationDecision): void {
    const decisionLabel: 'allowed' | 'denied' | 'approval_required' = result.allowed
      ? 'allowed'
      : result.requiresApproval
        ? 'approval_required'
        : 'denied'
    const event: AuditEvent = {
      id: randomUUID(),
      type: result.allowed
        ? 'authorization.allowed'
        : result.requiresApproval
          ? 'approval.requested'
          : 'authorization.denied',
      timestamp: new Date().toISOString(),
      principalId: request.principalId,
      grantId: request.grantId,
      ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
      ...(request.missionId === undefined ? {} : { missionId: request.missionId }),
      ...(request.repository === undefined ? {} : { repository: request.repository }),
      ...(request.branch === undefined ? {} : { branch: request.branch }),
      ...(request.toolName === undefined ? {} : { toolName: request.toolName }),
      capability: canonicalSandboxCapabilityId(request.capability),
      decision: decisionLabel,
      reasonCode: result.reasonCode,
      ...(result.approvalId === undefined ? {} : { approvalId: result.approvalId }),
      correlationId: result.correlationId,
    }
    this.store.appendAuditEvent(event)

    if (isHighRiskCapability(canonicalSandboxCapabilityId(request.capability))) {
      this.store.appendAuditEvent({
        id: randomUUID(),
        type: 'high_risk_operation.attempted',
        timestamp: new Date().toISOString(),
        principalId: request.principalId,
        grantId: request.grantId,
        capability: canonicalSandboxCapabilityId(request.capability),
        decision: decisionLabel,
        reasonCode: result.reasonCode,
        correlationId: result.correlationId,
      })
    }
  }
}
