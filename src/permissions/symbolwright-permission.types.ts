export const SYMBOLWRIGHT_PERMISSION_DISPOSITIONS = ['ALLOW', 'ASK', 'DENY'] as const
export type SymbolWrightPermissionDisposition =
  (typeof SYMBOLWRIGHT_PERMISSION_DISPOSITIONS)[number]

export const SYMBOLWRIGHT_RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'DENIED'] as const
export type SymbolWrightRiskLevel = (typeof SYMBOLWRIGHT_RISK_LEVELS)[number]

export const SYMBOLWRIGHT_MODES = [
  'PLAN',
  'READ_ONLY',
  'PATCH_PROPOSAL',
  'PR_REVIEW',
  'CI_REVIEW',
  'APPROVED_EDIT',
  'APPROVED_COMMAND',
  'RESTRICTED_AUTOMATION',
] as const
export type SymbolWrightMode = (typeof SYMBOLWRIGHT_MODES)[number]

export const SYMBOLWRIGHT_TOOL_CATEGORIES = [
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
export type SymbolWrightToolCategory = (typeof SYMBOLWRIGHT_TOOL_CATEGORIES)[number]

export const SYMBOLWRIGHT_TRUST_ZONES = [
  'OPERATOR_SESSION',
  'GOVERNANCE_CONTRACT',
  'POLICY_FILE',
  'REPO_METADATA',
  'REPO_FILE_CONTENT',
  'SYMBOLWRIGHT_MD',
  /** A target repository's own legacy `CODEMIND.md` file, recognized permanently alongside `SYMBOLWRIGHT.md` -- this classifies files in repos being analyzed, not this repo's own identity. */
  'CODEMIND_MD',
  'PROJECT_DOC',
  'CI_LOG',
  'PR_TEXT',
  'COMMIT_MESSAGE',
  'LLM_OUTPUT',
  'GENERATED_PLAN',
  'UNKNOWN',
] as const
export type SymbolWrightTrustZone = (typeof SYMBOLWRIGHT_TRUST_ZONES)[number]

export const SYMBOLWRIGHT_PROTECTED_PATH_CLASSES = [
  'SENSITIVE_CONFIG',
  'GOVERNANCE_POLICY',
  'AUDIT_LOG',
  'REVIEW_HISTORY',
  'GIT_INTERNAL',
  'CI_WORKFLOW',
  'ENVIRONMENT_CONFIG',
  'UNKNOWN_PROTECTED',
] as const
export type SymbolWrightProtectedPathClass = (typeof SYMBOLWRIGHT_PROTECTED_PATH_CLASSES)[number]

export const SYMBOLWRIGHT_TARGET_KINDS = [
  'file',
  'directory',
  'command',
  'git-ref',
  'github-resource',
  'network-resource',
  'project-doc',
  'unknown',
] as const
export type SymbolWrightTargetKind = (typeof SYMBOLWRIGHT_TARGET_KINDS)[number]

export interface SymbolWrightTarget {
  readonly kind: SymbolWrightTargetKind
  readonly value: string
  readonly normalizedValue?: string
  readonly protectedPathClass?: SymbolWrightProtectedPathClass
  readonly trustZone?: SymbolWrightTrustZone
}

export interface SymbolWrightProtectedPathHit {
  readonly target: string
  readonly normalizedTarget: string
  readonly protectedClass: SymbolWrightProtectedPathClass
  readonly matchedPattern: string
  readonly disposition: Extract<SymbolWrightPermissionDisposition, 'ASK' | 'DENY'>
  readonly reason: string
}

export interface SymbolWrightPermissionRequest {
  readonly requestId: string
  readonly sessionId: string
  readonly operatorId?: string
  readonly mode: SymbolWrightMode
  readonly toolCategory: SymbolWrightToolCategory
  readonly action: string
  readonly targets: readonly SymbolWrightTarget[]
  readonly sourceTrustZone: SymbolWrightTrustZone
  readonly operatorApproved: boolean
  readonly approvalRecordId?: string
  readonly contextSummary?: string
}

export interface SymbolWrightPermissionDecision {
  readonly requestId: string
  readonly disposition: SymbolWrightPermissionDisposition
  readonly risk: SymbolWrightRiskLevel
  readonly toolCategory: SymbolWrightToolCategory
  readonly reasons: readonly string[]
  readonly operatorApprovalRequired: boolean
  readonly auditRequired: boolean
  readonly policyVersion: string
  readonly policyId: string
  readonly protectedPathHits: readonly SymbolWrightProtectedPathHit[]
  readonly trustBoundaryNotes: readonly string[]
  readonly deniedByInvariant: boolean
  readonly expiresAt?: string
}
