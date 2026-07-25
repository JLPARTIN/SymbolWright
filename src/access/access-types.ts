/**
 * Delegated Agent Access — core type model.
 *
 * These types implement the four authorization layers described in
 * docs/security/DELEGATED_AGENT_ACCESS.md:
 *   A) principal identity, B) capability grants, C) GitHub delegation
 *   metadata, D) per-operation policy evaluation.
 */

export const PRINCIPAL_TYPES = [
  'human',
  'llm',
  'coding-agent',
  'mcp-client',
  'automation',
  'ci',
  'service-account',
] as const
export type PrincipalType = (typeof PRINCIPAL_TYPES)[number]

export interface Principal {
  readonly id: string
  readonly type: PrincipalType
  readonly displayName: string
  readonly createdAt: string
}

export const RISK_LEVELS = ['read', 'low', 'write', 'high', 'critical'] as const
export type RiskLevel = (typeof RISK_LEVELS)[number]

export const GRANT_STATUSES = ['pending', 'active', 'paused', 'expired', 'revoked'] as const
export type GrantStatus = (typeof GRANT_STATUSES)[number]

export const APPROVAL_REQUIREMENTS = [
  'none',
  'once-per-session',
  'once-per-mission',
  'before-first-write',
  'before-push',
  'before-pull-request',
  'before-merge',
  'every-high-risk-operation',
  'denied',
] as const
export type ApprovalRequirement = (typeof APPROVAL_REQUIREMENTS)[number]

export const REPOSITORY_SCOPE_MODES = [
  'single',
  'selected',
  'installation',
  'organization',
  'discovery',
] as const
export type RepositoryScopeMode = (typeof REPOSITORY_SCOPE_MODES)[number]

/** `repositories` entries are exact `owner/repo` allowlist strings — never inferred from visibility. */
export interface RepositoryScope {
  readonly mode: RepositoryScopeMode
  readonly repositories: readonly string[]
  readonly organizations: readonly string[]
  readonly installationId?: string
  /** Repositories explicitly activated under `discovery` mode; ignored for other modes. */
  readonly activatedRepositories?: readonly string[]
}

export const DEFAULT_ALLOWED_BRANCH_PATTERNS = [
  'symbolwright/agent/**',
  'codemind/agent/**',
  'feat/**',
  'fix/**',
] as const

export const DEFAULT_DENIED_BRANCH_PATTERNS = [
  'main',
  'master',
  'release/**',
  'production/**',
] as const

export interface BranchScope {
  readonly allowedPatterns: readonly string[]
  readonly deniedPatterns: readonly string[]
  /** When true, the default branch may only be read, never mutated. */
  readonly defaultBranchReadOnly: boolean
  /** Explicit elevated opt-in required to mutate the default branch. Defaults to false. */
  readonly defaultBranchMutationAllowed: boolean
  /** When true, only branches this grant's own missions created may be mutated. */
  readonly agentCreatedOnly?: boolean
}

export interface MissionExecutionLimits {
  readonly maxConcurrentMissions?: number
  readonly maxMissionDurationMinutes?: number
  readonly maxRepairAttempts?: number
  readonly sandboxNetworkAccess?: boolean
  readonly allowedCommands?: readonly string[]
  readonly maxFilesChanged?: number
  readonly maxDiffLines?: number
  readonly maxCommits?: number
  readonly requirePullRequest?: boolean
  readonly allowDirectPush?: boolean
}

export interface SessionLimits {
  readonly maxConcurrentSessions?: number
  readonly maxSessionDurationMinutes?: number
  readonly inactivityTimeoutMinutes?: number
  readonly singleUse?: boolean
}

export interface ClientConstraints {
  readonly allowedIpCidrs?: readonly string[]
  readonly allowedClientIds?: readonly string[]
}

export interface ApprovalRule {
  /** A specific capability id, the literal `'high-risk'` (matches every high-risk capability), or `'*'`. */
  readonly match: string
  readonly requirement: ApprovalRequirement
}

export interface ApprovalPolicy {
  readonly rules: readonly ApprovalRule[]
}

export interface CredentialMetadata {
  readonly kind: 'manual-token' | 'device-flow' | 'pat-fallback'
  readonly tokenPrefix: string
  readonly lastFour: string
  readonly createdAt: string
  readonly lastUsedAt?: string
  readonly lastUsedClient?: string
  readonly rotatedFromCredentialId?: string
}

export interface AgentAccessGrant {
  readonly id: string
  readonly version: number
  readonly principalId: string
  readonly principalType: PrincipalType
  readonly displayName: string

  readonly issuedBy: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly startsAt: string
  readonly expiresAt: string

  readonly status: GrantStatus
  readonly profileId: string

  readonly repositoryScope: RepositoryScope
  readonly branchScope: BranchScope
  readonly symbolWrightCapabilities: readonly string[]
  readonly githubCapabilities: readonly string[]
  readonly deniedCapabilities: readonly string[]

  readonly approvalPolicy: ApprovalPolicy
  readonly executionLimits: MissionExecutionLimits
  readonly sessionLimits: SessionLimits
  readonly clientConstraints?: ClientConstraints

  readonly credentialMetadata?: CredentialMetadata
  readonly reason?: string

  readonly pausedAt?: string
  readonly pausedBy?: string
  readonly revokedAt?: string
  readonly revokedBy?: string
  readonly revocationReason?: string
}

export interface AgentSession {
  readonly id: string
  readonly grantId: string
  readonly grantVersion: number
  readonly principalId: string
  readonly credentialId: string
  readonly createdAt: string
  readonly expiresAt: string
  readonly lastActiveAt: string
  readonly clientMetadata?: Record<string, string>
  readonly revoked: boolean
}

export interface ApprovalRequest {
  readonly id: string
  readonly grantId: string
  readonly capability: string
  readonly repository?: string
  readonly branch?: string
  readonly missionId?: string
  readonly summary: string
  readonly createdAt: string
  readonly expiresAt: string
  readonly status: 'pending' | 'approved' | 'denied' | 'expired' | 'consumed'
  readonly boundOperationKey: string
  readonly approverId?: string
  readonly decidedAt?: string
  readonly operatorComment?: string
}

export const AUDIT_EVENT_TYPES = [
  'grant.created',
  'grant.updated',
  'grant.activated',
  'grant.paused',
  'grant.resumed',
  'grant.revoked',
  'grant.expired',
  'credential.created',
  'credential.rotated',
  'credential.revoked',
  'session.started',
  'session.ended',
  'authorization.allowed',
  'authorization.denied',
  'approval.requested',
  'approval.approved',
  'approval.denied',
  'tool.invoked',
  'mission.created',
  'mission.executed',
  'repository.read',
  'repository.mutated',
  'branch.created',
  'commit.pushed',
  'pull_request.created',
  'pull_request.updated',
  'pull_request.merged',
  'high_risk_operation.attempted',
  'device_authorization.requested',
  'device_authorization.approved',
  'device_authorization.denied',
] as const
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number]

export interface AuditEvent {
  readonly id: string
  readonly type: AuditEventType
  readonly timestamp: string
  readonly principalId?: string
  readonly grantId?: string
  readonly sessionId?: string
  readonly missionId?: string
  readonly repository?: string
  readonly branch?: string
  readonly toolName?: string
  readonly capability?: string
  readonly decision?: 'allowed' | 'denied' | 'approval_required'
  readonly reasonCode?: string
  readonly approvalId?: string
  readonly correlationId?: string
  readonly metadata?: Record<string, unknown>
}

export interface DeviceAuthorization {
  readonly deviceCode: string
  readonly userCode: string
  readonly principalId: string
  readonly principalType: PrincipalType
  readonly displayName: string
  readonly requestedProfileId: string
  readonly requestedRepositoryScope: RepositoryScope
  readonly clientId?: string
  readonly createdAt: string
  readonly expiresAt: string
  readonly pollIntervalSeconds: number
  readonly status: 'pending' | 'approved' | 'denied' | 'expired' | 'consumed'
  readonly grantId?: string
  readonly issuedTokenId?: string
  readonly decidedAt?: string
  readonly decidedBy?: string
}
