import { randomUUID } from 'node:crypto'

import { isHighRiskCapability } from './access-capability-catalog.js'
import {
  AGENT_TOKEN_PREFIX,
  generateAgentToken,
  hashSecret,
  parseAgentToken,
  verifySecret,
} from './access-credential.js'
import { getPermissionProfile } from './access-profiles.js'
import type { AccessStore, StoredCredential } from './access-store.js'
import type {
  AgentAccessGrant,
  AgentSession,
  ApprovalPolicy,
  BranchScope,
  ClientConstraints,
  CredentialMetadata,
  GrantStatus,
  MissionExecutionLimits,
  PrincipalType,
  RepositoryScope,
  SessionLimits,
} from './access-types.js'

export class GrantValidationError extends Error {}
export class StepUpRequiredError extends Error {}
export class GrantNotFoundError extends Error {}
export class InvalidCredentialError extends Error {}
export class SessionLimitExceededError extends Error {}

export interface CreateGrantInput {
  readonly principalId?: string
  readonly principalType: PrincipalType
  readonly displayName: string
  readonly issuedBy: string
  readonly profileId: string
  readonly repositoryScope: RepositoryScope
  readonly branchScope?: Partial<BranchScope>
  readonly additionalSymbolWrightCapabilities?: readonly string[]
  readonly additionalGithubCapabilities?: readonly string[]
  readonly deniedCapabilities?: readonly string[]
  readonly approvalPolicy?: ApprovalPolicy
  readonly executionLimits?: MissionExecutionLimits
  readonly sessionLimits?: SessionLimits
  readonly clientConstraints?: ClientConstraints
  readonly expiresInHours?: number
  readonly startsAt?: string
  readonly reason?: string
  /** Required `true` when the chosen profile is `requiresStepUp` (e.g. Temporary Administrator). */
  readonly stepUpConfirmed?: boolean
  /** `repo.pull_request.merge` is only included when this is explicitly `true`, even for profiles that list it. */
  readonly enableMerge?: boolean
  /**
   * The *only* channel through which a high-risk (`riskLevel: 'critical'`, or `'high'` other than
   * merge) capability can be added to a grant — never via `additionalGithubCapabilities`. Requires
   * `stepUpConfirmed: true` and a non-empty `reason`, matching every high-risk-capability rule in
   * `docs/security/DELEGATED_AGENT_ACCESS.md`.
   */
  readonly explicitHighRiskCapabilities?: readonly string[]
  readonly issueTokenNow?: boolean
}

export interface CreatedGrant {
  readonly grant: AgentAccessGrant
  /** Present only when `issueTokenNow` was not `false` — shown once, never persisted in plaintext. */
  readonly plaintextToken?: string
  readonly credentialId?: string
}

function mergeBranchScope(
  base: BranchScope,
  overrides: Partial<BranchScope> | undefined,
): BranchScope {
  if (overrides === undefined) return base
  return {
    allowedPatterns: overrides.allowedPatterns ?? base.allowedPatterns,
    deniedPatterns: overrides.deniedPatterns ?? base.deniedPatterns,
    defaultBranchReadOnly: overrides.defaultBranchReadOnly ?? base.defaultBranchReadOnly,
    defaultBranchMutationAllowed:
      overrides.defaultBranchMutationAllowed ?? base.defaultBranchMutationAllowed,
    ...(overrides.agentCreatedOnly === undefined
      ? base.agentCreatedOnly === undefined
        ? {}
        : { agentCreatedOnly: base.agentCreatedOnly }
      : { agentCreatedOnly: overrides.agentCreatedOnly }),
  }
}

export class AccessGrantService {
  public constructor(
    private readonly store: AccessStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public createGrant(input: CreateGrantInput): CreatedGrant {
    const profile = getPermissionProfile(input.profileId)
    if (profile === undefined) {
      throw new GrantValidationError(`Unknown permission profile "${input.profileId}".`)
    }
    if (profile.requiresStepUp && input.stepUpConfirmed !== true) {
      throw new StepUpRequiredError(
        `Profile "${profile.id}" requires step-up confirmation (stepUpConfirmed: true) and a reason.`,
      )
    }
    if (profile.requiresStepUp && (input.reason ?? '').trim().length === 0) {
      throw new StepUpRequiredError(`Profile "${profile.id}" requires a mandatory reason.`)
    }

    const explicitHighRisk = new Set(input.explicitHighRiskCapabilities ?? [])
    if (
      explicitHighRisk.size > 0 &&
      (input.stepUpConfirmed !== true || (input.reason ?? '').trim().length === 0)
    ) {
      throw new StepUpRequiredError(
        'Selecting a high-risk capability requires step-up confirmation (stepUpConfirmed: true) and a mandatory reason.',
      )
    }

    const requestedSymbolWright = [
      ...profile.symbolWrightCapabilities,
      ...(input.additionalSymbolWrightCapabilities ?? []),
    ]
    let requestedGithub = [
      ...profile.githubCapabilities,
      ...(input.additionalGithubCapabilities ?? []),
    ]
    if (input.enableMerge !== true) {
      requestedGithub = requestedGithub.filter((id) => id !== 'repo.pull_request.merge')
    }

    const hardDenied = new Set(profile.hardDenied)
    const explicitlyDenied = new Set(input.deniedCapabilities ?? [])
    // High-risk capabilities are never included silently: the only two channels that can add one
    // are `enableMerge` (for `repo.pull_request.merge` specifically) and `explicitHighRiskCapabilities`
    // (step-up-gated, for everything else) — never a profile default or `additional*Capabilities`.
    const isPermittedHighRisk = (id: string): boolean =>
      !isHighRiskCapability(id) || id === 'repo.pull_request.merge' || explicitHighRisk.has(id)
    const symbolWrightCapabilities = [...new Set(requestedSymbolWright)].filter(
      (id) => !hardDenied.has(id) && !explicitlyDenied.has(id) && isPermittedHighRisk(id),
    )
    const githubCapabilities = [...new Set(requestedGithub)].filter(
      (id) => !hardDenied.has(id) && !explicitlyDenied.has(id) && isPermittedHighRisk(id),
    )

    const startsAt = input.startsAt ?? this.now().toISOString()
    const expiresInHours = Math.min(
      input.expiresInHours ?? profile.defaultExpiryHours,
      profile.maxExpiryHours,
    )
    const expiresAt = new Date(
      new Date(startsAt).getTime() + expiresInHours * 60 * 60 * 1000,
    ).toISOString()
    const now = this.now().toISOString()
    const status: GrantStatus =
      new Date(startsAt).getTime() > this.now().getTime() ? 'pending' : 'active'

    const grant: AgentAccessGrant = {
      id: randomUUID(),
      version: 1,
      principalId: input.principalId ?? randomUUID(),
      principalType: input.principalType,
      displayName: input.displayName,
      issuedBy: input.issuedBy,
      createdAt: now,
      updatedAt: now,
      startsAt,
      expiresAt,
      status,
      profileId: profile.id,
      repositoryScope: input.repositoryScope,
      branchScope: mergeBranchScope(profile.defaultBranchScope, input.branchScope),
      symbolWrightCapabilities,
      githubCapabilities,
      deniedCapabilities: [...hardDenied, ...explicitlyDenied],
      approvalPolicy: input.approvalPolicy ?? profile.defaultApprovalPolicy,
      executionLimits: { ...profile.defaultExecutionLimits, ...input.executionLimits },
      sessionLimits: input.sessionLimits ?? {},
      ...(input.clientConstraints === undefined
        ? {}
        : { clientConstraints: input.clientConstraints }),
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    }

    this.store.writeGrant(grant)
    this.store.appendAuditEvent({
      id: randomUUID(),
      type: 'grant.created',
      timestamp: now,
      grantId: grant.id,
      principalId: grant.principalId,
      metadata: { profileId: profile.id, displayName: grant.displayName },
    })
    if (status === 'active') {
      this.store.appendAuditEvent({
        id: randomUUID(),
        type: 'grant.activated',
        timestamp: now,
        grantId: grant.id,
        principalId: grant.principalId,
      })
    }

    if (input.issueTokenNow === false) {
      return { grant }
    }
    const issued = this.issueCredential(grant.id, 'manual-token')
    return { grant, plaintextToken: issued.token, credentialId: issued.credentialId }
  }

  public issueCredential(
    grantId: string,
    kind: CredentialMetadata['kind'],
  ): { readonly token: string; readonly credentialId: string } {
    const grant = this.requireGrant(grantId)
    const generated = generateAgentToken()
    const { saltHex, hashHex } = hashSecret(generated.token.split('.').slice(-1)[0] as string)
    const now = this.now().toISOString()
    const metadata: CredentialMetadata = {
      kind,
      tokenPrefix: AGENT_TOKEN_PREFIX,
      lastFour: generated.lastFour,
      createdAt: now,
    }
    const record: StoredCredential = {
      id: generated.credentialId,
      grantId,
      saltHex,
      hashHex,
      metadata,
      revoked: false,
    }
    this.store.writeCredential(record)
    this.store.writeGrant({ ...grant, credentialMetadata: metadata, updatedAt: now })
    this.store.appendAuditEvent({
      id: randomUUID(),
      type: 'credential.created',
      timestamp: now,
      grantId,
      principalId: grant.principalId,
      metadata: { credentialId: record.id, kind },
    })
    return { token: generated.token, credentialId: record.id }
  }

  public rotateCredential(grantId: string): {
    readonly token: string
    readonly credentialId: string
  } {
    const grant = this.requireGrant(grantId)
    for (const existing of this.store.listCredentialsForGrant(grantId)) {
      if (!existing.revoked) {
        this.store.writeCredential({
          ...existing,
          revoked: true,
          revokedAt: this.now().toISOString(),
        })
      }
    }
    for (const session of this.store.listSessionsForGrant(grantId)) {
      if (!session.revoked) this.store.writeSession({ ...session, revoked: true })
    }
    const issued = this.issueCredential(grantId, grant.credentialMetadata?.kind ?? 'manual-token')
    this.store.appendAuditEvent({
      id: randomUUID(),
      type: 'credential.rotated',
      timestamp: this.now().toISOString(),
      grantId,
      principalId: grant.principalId,
      metadata: { credentialId: issued.credentialId },
    })
    return issued
  }

  public pauseGrant(grantId: string, actor: string): AgentAccessGrant {
    const grant = this.requireGrant(grantId)
    const now = this.now().toISOString()
    const updated: AgentAccessGrant = {
      ...grant,
      status: 'paused',
      version: grant.version + 1,
      updatedAt: now,
      pausedAt: now,
      pausedBy: actor,
    }
    this.store.writeGrant(updated)
    this.revokeAllSessions(grantId)
    this.store.appendAuditEvent({
      id: randomUUID(),
      type: 'grant.paused',
      timestamp: now,
      grantId,
      principalId: grant.principalId,
      metadata: { actor },
    })
    return updated
  }

  public resumeGrant(grantId: string, actor: string): AgentAccessGrant {
    const grant = this.requireGrant(grantId)
    if (grant.status !== 'paused') {
      throw new GrantValidationError(
        `Only a paused grant can be resumed (current status: ${grant.status}). Revocation is permanent.`,
      )
    }
    if (new Date(grant.expiresAt).getTime() <= this.now().getTime()) {
      throw new GrantValidationError('Cannot resume an expired grant; create a new one instead.')
    }
    const now = this.now().toISOString()
    const { pausedAt: _pausedAt, pausedBy: _pausedBy, ...grantWithoutPause } = grant
    const updated: AgentAccessGrant = {
      ...grantWithoutPause,
      status: 'active',
      version: grant.version + 1,
      updatedAt: now,
    }
    this.store.writeGrant(updated)
    this.store.appendAuditEvent({
      id: randomUUID(),
      type: 'grant.resumed',
      timestamp: now,
      grantId,
      principalId: grant.principalId,
      metadata: { actor },
    })
    return updated
  }

  public revokeGrant(grantId: string, actor: string, reason?: string): AgentAccessGrant {
    const grant = this.requireGrant(grantId)
    const now = this.now().toISOString()
    const updated: AgentAccessGrant = {
      ...grant,
      status: 'revoked',
      version: grant.version + 1,
      updatedAt: now,
      revokedAt: now,
      revokedBy: actor,
      ...(reason === undefined ? {} : { revocationReason: reason }),
    }
    this.store.writeGrant(updated)
    this.revokeAllSessions(grantId)
    for (const credential of this.store.listCredentialsForGrant(grantId)) {
      if (!credential.revoked) {
        this.store.writeCredential({ ...credential, revoked: true, revokedAt: now })
      }
    }
    this.store.appendAuditEvent({
      id: randomUUID(),
      type: 'grant.revoked',
      timestamp: now,
      grantId,
      principalId: grant.principalId,
      metadata: { actor, ...(reason === undefined ? {} : { reason }) },
    })
    return updated
  }

  public deleteGrant(grantId: string): void {
    this.requireGrant(grantId)
    this.revokeAllSessions(grantId)
    this.store.deleteGrant(grantId)
  }

  public getGrant(grantId: string): AgentAccessGrant | undefined {
    return this.store.readGrant(grantId)
  }

  /**
   * Narrows an existing grant — the only mutation channel a `PATCH` route may use. Deliberately
   * one-directional: this can only shrink what a grant allows (add denied capabilities, tighten
   * `expiresAt` to an earlier time, adjust metadata/limits) and can never add a capability, widen
   * repository/branch scope, or extend expiry — that would let an operator-editing-error or a
   * confused-deputy PATCH silently re-grant something a step-up/high-risk flow should gate
   * instead. Use `rotateCredential`/`resumeGrant` for anything that expands access.
   */
  public narrowGrant(
    grantId: string,
    patch: {
      readonly displayName?: string
      readonly reason?: string
      readonly additionalDeniedCapabilities?: readonly string[]
      readonly expiresAt?: string
      readonly executionLimits?: MissionExecutionLimits
      readonly sessionLimits?: SessionLimits
    },
  ): AgentAccessGrant {
    const grant = this.requireGrant(grantId)
    const now = this.now()

    let expiresAt = grant.expiresAt
    if (patch.expiresAt !== undefined) {
      const requested = new Date(patch.expiresAt).getTime()
      const current = new Date(grant.expiresAt).getTime()
      if (!Number.isFinite(requested)) {
        throw new GrantValidationError('expiresAt must be a valid date.')
      }
      if (requested >= current) {
        throw new GrantValidationError(
          'PATCH can only shorten a grant’s expiration, never extend it.',
        )
      }
      expiresAt = new Date(requested).toISOString()
    }

    const deniedCapabilities = [
      ...new Set([...grant.deniedCapabilities, ...(patch.additionalDeniedCapabilities ?? [])]),
    ]
    const symbolWrightCapabilities = grant.symbolWrightCapabilities.filter(
      (id) => !deniedCapabilities.includes(id),
    )
    const githubCapabilities = grant.githubCapabilities.filter(
      (id) => !deniedCapabilities.includes(id),
    )

    const updated: AgentAccessGrant = {
      ...grant,
      version: grant.version + 1,
      updatedAt: now.toISOString(),
      expiresAt,
      deniedCapabilities,
      symbolWrightCapabilities,
      githubCapabilities,
      ...(patch.displayName === undefined ? {} : { displayName: patch.displayName }),
      ...(patch.reason === undefined ? {} : { reason: patch.reason }),
      ...(patch.executionLimits === undefined
        ? {}
        : { executionLimits: { ...grant.executionLimits, ...patch.executionLimits } }),
      ...(patch.sessionLimits === undefined
        ? {}
        : { sessionLimits: { ...grant.sessionLimits, ...patch.sessionLimits } }),
    }
    this.store.writeGrant(updated)
    this.store.appendAuditEvent({
      id: randomUUID(),
      type: 'grant.updated',
      timestamp: now.toISOString(),
      grantId,
      principalId: grant.principalId,
    })
    return updated
  }

  public listGrants(): readonly AgentAccessGrant[] {
    return this.store.listGrants()
  }

  /**
   * Verifies a presented `sw_agent_...` bearer token, checks the underlying grant/credential are
   * live, and returns (or creates, subject to `sessionLimits.maxConcurrentSessions`) a session.
   * Every check here is live — a paused/revoked/expired grant fails immediately, not just at
   * token-expiry time.
   */
  public authenticateAgentToken(
    presented: string,
    clientMetadata?: Record<string, string>,
  ): { readonly grant: AgentAccessGrant; readonly session: AgentSession } {
    const parsed = parseAgentToken(presented)
    if (parsed === undefined) throw new InvalidCredentialError('Malformed agent token.')

    const credential = this.store.readCredential(parsed.credentialId)
    if (credential === undefined || credential.revoked) {
      throw new InvalidCredentialError('Unknown or revoked agent token.')
    }
    if (!verifySecret(parsed.secret, credential)) {
      throw new InvalidCredentialError('Invalid agent token.')
    }

    const grant = this.store.readGrant(credential.grantId)
    if (grant === undefined)
      throw new InvalidCredentialError('Grant for this token no longer exists.')
    if (grant.status !== 'active') {
      if (
        grant.status !== 'expired' &&
        new Date(grant.expiresAt).getTime() <= this.now().getTime()
      ) {
        this.store.writeGrant({ ...grant, status: 'expired', updatedAt: this.now().toISOString() })
      }
      throw new InvalidCredentialError(`Grant is ${grant.status}.`)
    }
    if (new Date(grant.expiresAt).getTime() <= this.now().getTime()) {
      this.store.writeGrant({ ...grant, status: 'expired', updatedAt: this.now().toISOString() })
      throw new InvalidCredentialError('Grant has expired.')
    }

    const now = this.now()
    const activeSessions = this.store
      .listSessionsForGrant(grant.id)
      .filter(
        (session) => !session.revoked && new Date(session.expiresAt).getTime() > now.getTime(),
      )
    const existing = activeSessions.find((session) => session.credentialId === credential.id)

    const maxConcurrent = grant.sessionLimits.maxConcurrentSessions
    if (
      existing === undefined &&
      maxConcurrent !== undefined &&
      activeSessions.length >= maxConcurrent
    ) {
      throw new SessionLimitExceededError(
        'Maximum concurrent session limit reached for this grant.',
      )
    }

    const sessionDurationMs = (grant.sessionLimits.maxSessionDurationMinutes ?? 24 * 60) * 60_000
    const session: AgentSession = {
      id: existing?.id ?? randomUUID(),
      grantId: grant.id,
      grantVersion: grant.version,
      principalId: grant.principalId,
      credentialId: credential.id,
      createdAt: existing?.createdAt ?? now.toISOString(),
      expiresAt: existing?.expiresAt ?? new Date(now.getTime() + sessionDurationMs).toISOString(),
      lastActiveAt: now.toISOString(),
      ...(clientMetadata === undefined ? {} : { clientMetadata }),
      revoked: false,
    }
    this.store.writeSession(session)
    if (existing === undefined) {
      this.store.appendAuditEvent({
        id: randomUUID(),
        type: 'session.started',
        timestamp: now.toISOString(),
        grantId: grant.id,
        principalId: grant.principalId,
        sessionId: session.id,
      })
    }

    if (grant.sessionLimits.singleUse === true) {
      this.store.writeCredential({ ...credential, revoked: true, revokedAt: now.toISOString() })
    }

    if (grant.credentialMetadata !== undefined) {
      this.store.writeGrant({
        ...grant,
        credentialMetadata: { ...grant.credentialMetadata, lastUsedAt: now.toISOString() },
      })
    }

    return { grant, session }
  }

  private revokeAllSessions(grantId: string): void {
    for (const session of this.store.listSessionsForGrant(grantId)) {
      if (!session.revoked) {
        this.store.writeSession({ ...session, revoked: true })
        this.store.appendAuditEvent({
          id: randomUUID(),
          type: 'session.ended',
          timestamp: this.now().toISOString(),
          grantId,
          sessionId: session.id,
        })
      }
    }
  }

  private requireGrant(grantId: string): AgentAccessGrant {
    const grant = this.store.readGrant(grantId)
    if (grant === undefined) throw new GrantNotFoundError(`Grant not found: ${grantId}`)
    return grant
  }
}
