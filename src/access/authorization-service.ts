import { createHash, randomUUID } from 'node:crypto'

import {
  capabilityRiskLevel,
  isHighRiskCapability,
  isKnownCapability,
} from './access-capability-catalog.js'
import { matchesAnyBranchPattern, matchesAnyRepositoryPattern } from './access-branch-match.js'
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
  const parts = [
    request.grantId,
    request.capability,
    request.repository ?? '',
    request.branch ?? '',
    request.missionId ?? '',
  ]
  return createHash('sha256').update(parts.join('')).digest('hex')
}

function matchApprovalRequirement(
  grant: AgentAccessGrant,
  capability: string,
): ApprovalRequirement {
  const rules = grant.approvalPolicy.rules
  const exact = rules.find((rule) => rule.match === capability)
  if (exact !== undefined) return exact.requirement
  if (isHighRiskCapability(capability)) {
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
    const riskLevel = capabilityRiskLevel(request.capability) ?? 'critical'

    evaluatedPolicies.push('capability-known')
    if (!isKnownCapability(request.capability)) {
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
    if (grant.deniedCapabilities.includes(capability)) {
      return decision(
        {
          allowed: false,
          reasonCode: 'CAPABILITY_DENIED',
          reason: `This agent is explicitly denied "${capability}".`,
          requiresApproval: false,
          grantVersion: grant.version,
          riskLevel,
          evaluatedPolicies,
        },
        correlationId,
      )
    }

    const granted =
      grant.symbolWrightCapabilities.includes(capability) ||
      grant.githubCapabilities.includes(capability)
    if (!granted) {
      return decision(
        {
          allowed: false,
          reasonCode: 'CAPABILITY_NOT_GRANTED',
          reason: `This agent is not permitted to use "${capability}".`,
          requiresApproval: false,
          grantVersion: grant.version,
          riskLevel,
          evaluatedPolicies,
        },
        correlationId,
      )
    }

    if (isHighRiskCapability(capability)) {
      evaluatedPolicies.push('high-risk-explicit-selection')
      // Membership above already required explicit inclusion (no wildcard ever expands to
      // high-risk capabilities — see `expandNonHighRiskWildcard`), so reaching here means the
      // operator explicitly selected it. Nothing further to deny here; approval policy still applies.
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
    const branch = request.branch as string
    const scope = grant.branchScope

    if (matchesAnyBranchPattern(branch, scope.deniedPatterns) !== undefined) {
      return decision(
        {
          allowed: false,
          reasonCode: 'BRANCH_PROTECTED',
          reason: `Branch "${branch}" is protected and cannot be mutated by this grant.`,
          requiresApproval: false,
          grantVersion: grant.version,
          riskLevel,
          evaluatedPolicies,
        },
        correlationId,
      )
    }

    if (request.isDefaultBranch === true && !scope.defaultBranchMutationAllowed) {
      return decision(
        {
          allowed: false,
          reasonCode: 'DEFAULT_BRANCH_PROTECTED',
          reason: 'The default branch is read-only for this grant.',
          requiresApproval: false,
          grantVersion: grant.version,
          riskLevel,
          evaluatedPolicies,
        },
        correlationId,
      )
    }

    if (
      request.isDefaultBranch !== true &&
      matchesAnyBranchPattern(branch, scope.allowedPatterns) === undefined
    ) {
      return decision(
        {
          allowed: false,
          reasonCode: 'BRANCH_OUT_OF_SCOPE',
          reason: `Branch "${branch}" does not match this grant's allowed branch patterns.`,
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
          new Date(entry.expiresAt).getTime() > Date.now(),
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
          new Date(entry.expiresAt).getTime() > Date.now(),
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
    const approval: ApprovalRequest = {
      id: randomUUID(),
      grantId: grant.id,
      capability: request.capability,
      ...(request.repository === undefined ? {} : { repository: request.repository }),
      ...(request.branch === undefined ? {} : { branch: request.branch }),
      ...(request.missionId === undefined ? {} : { missionId: request.missionId }),
      summary: `${request.capability}${request.repository ? ` on ${request.repository}` : ''}${
        request.branch ? ` (branch ${request.branch})` : ''
      }`,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      status: 'pending',
      boundOperationKey: boundKey,
    }
    this.store.writeApproval(approval)
    this.store.appendAuditEvent({
      id: randomUUID(),
      type: 'approval.requested',
      timestamp: now.toISOString(),
      grantId: grant.id,
      principalId: grant.principalId,
      capability: request.capability,
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
      capability: request.capability,
      decision: decisionLabel,
      reasonCode: result.reasonCode,
      ...(result.approvalId === undefined ? {} : { approvalId: result.approvalId }),
      correlationId: result.correlationId,
    }
    this.store.appendAuditEvent(event)

    if (isHighRiskCapability(request.capability)) {
      this.store.appendAuditEvent({
        id: randomUUID(),
        type: 'high_risk_operation.attempted',
        timestamp: new Date().toISOString(),
        principalId: request.principalId,
        grantId: request.grantId,
        capability: request.capability,
        decision: decisionLabel,
        reasonCode: result.reasonCode,
        correlationId: result.correlationId,
      })
    }
  }
}
