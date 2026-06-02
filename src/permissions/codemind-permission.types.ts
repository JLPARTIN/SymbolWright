export const CODEMIND_PERMISSION_DISPOSITIONS = ['ALLOW', 'ASK', 'DENY'] as const
export type CodemindPermissionDisposition = (typeof CODEMIND_PERMISSION_DISPOSITIONS)[number]

export const CODEMIND_RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'DENIED'] as const
export type CodemindRiskLevel = (typeof CODEMIND_RISK_LEVELS)[number]

export const CODEMIND_MODES = [
  'PLAN',
  'READ_ONLY',
  'PATCH_PROPOSAL',
  'PR_REVIEW',
  'CI_REVIEW',
  'APPROVED_EDIT',
  'APPROVED_COMMAND',
  'RESTRICTED_AUTOMATION',
] as const
export type CodemindMode = (typeof CODEMIND_MODES)[number]

export const CODEMIND_TOOL_CATEGORIES = [
  'NO_TOOL',
  'PLANNER',
  'REPO_METADATA_READER',
  'FILE_READER',
  'SEARCH_READER',
  'CONTEXT_ASSEMBLER',
  'PATCH_PROPOSER',
  'PATCH_APPLIER',
  'COMMAND_RUNNER',
  'GIT_READER',
  'GIT_MUTATOR',
  'GITHUB_READER',
  'GITHUB_MUTATOR',
  'NETWORK_READER',
  'AUDIT_WRITER',
  'PROJECT_DOC_READER',
  'PROJECT_DOC_WRITER',
  'AJNA_REVIEWER',
] as const
export type CodemindToolCategory = (typeof CODEMIND_TOOL_CATEGORIES)[number]

export const CODEMIND_TRUST_ZONES = [
  'OPERATOR_SESSION',
  'GOVERNANCE_CONTRACT',
  'POLICY_FILE',
  'REPO_METADATA',
  'REPO_FILE_CONTENT',
  'CODEMIND_MD',
  'PROJECT_DOC',
  'CI_LOG',
  'PR_TEXT',
  'COMMIT_MESSAGE',
  'LLM_OUTPUT',
  'GENERATED_PLAN',
  'UNKNOWN',
] as const
export type CodemindTrustZone = (typeof CODEMIND_TRUST_ZONES)[number]

export const CODEMIND_PROTECTED_PATH_CLASSES = [
  'SENSITIVE_CONFIG',
  'GOVERNANCE_POLICY',
  'AUDIT_LOG',
  'REVIEW_HISTORY',
  'GIT_INTERNAL',
  'CI_WORKFLOW',
  'ENVIRONMENT_CONFIG',
  'UNKNOWN_PROTECTED',
] as const
export type CodemindProtectedPathClass = (typeof CODEMIND_PROTECTED_PATH_CLASSES)[number]

export const CODEMIND_TARGET_KINDS = [
  'file',
  'directory',
  'command',
  'git-ref',
  'github-resource',
  'network-resource',
  'project-doc',
  'unknown',
] as const
export type CodemindTargetKind = (typeof CODEMIND_TARGET_KINDS)[number]

export interface CodemindTarget {
  readonly kind: CodemindTargetKind
  readonly value: string
  readonly normalizedValue?: string
  readonly protectedPathClass?: CodemindProtectedPathClass
  readonly trustZone?: CodemindTrustZone
}

export interface CodemindProtectedPathHit {
  readonly target: string
  readonly normalizedTarget: string
  readonly protectedClass: CodemindProtectedPathClass
  readonly matchedPattern: string
  readonly disposition: Extract<CodemindPermissionDisposition, 'ASK' | 'DENY'>
  readonly reason: string
}

export interface CodemindPermissionRequest {
  readonly requestId: string
  readonly sessionId: string
  readonly operatorId?: string
  readonly mode: CodemindMode
  readonly toolCategory: CodemindToolCategory
  readonly action: string
  readonly targets: readonly CodemindTarget[]
  readonly sourceTrustZone: CodemindTrustZone
  readonly operatorApproved: boolean
  readonly approvalRecordId?: string
  readonly contextSummary?: string
}

export interface CodemindPermissionDecision {
  readonly requestId: string
  readonly disposition: CodemindPermissionDisposition
  readonly risk: CodemindRiskLevel
  readonly toolCategory: CodemindToolCategory
  readonly reasons: readonly string[]
  readonly operatorApprovalRequired: boolean
  readonly auditRequired: boolean
  readonly policyVersion: string
  readonly policyId: string
  readonly protectedPathHits: readonly CodemindProtectedPathHit[]
  readonly trustBoundaryNotes: readonly string[]
  readonly deniedByInvariant: boolean
  readonly expiresAt?: string
}
