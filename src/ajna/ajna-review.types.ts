export const AJNA_EVIDENCE_CLASSES = [
  'DIRECT_DIFF_EVIDENCE',
  'DIRECT_TEST_EVIDENCE',
  'DIRECT_CI_EVIDENCE',
  'REPO_CONTEXT_EVIDENCE',
  'HISTORICAL_PATTERN_EVIDENCE',
  'INFERRED_RISK',
  'UNVERIFIED_HYPOTHESIS',
  'UNKNOWN',
] as const
export type AjnaEvidenceClass = (typeof AJNA_EVIDENCE_CLASSES)[number]

export const AJNA_RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'BLOCKED'] as const
export type AjnaRiskLevel = (typeof AJNA_RISK_LEVELS)[number]

export const AJNA_FINDING_CATEGORIES = [
  'DIFF_RISK',
  'TEST_GAP',
  'CI_SIGNAL',
  'ARCHITECTURE_DRIFT',
  'SECURITY_SENSITIVE_CHANGE',
  'DEPENDENCY_CHANGE',
  'API_CONTRACT_CHANGE',
  'DATABASE_OR_SCHEMA_CHANGE',
  'DOCUMENTATION_ONLY',
  'UNKNOWN',
] as const
export type AjnaFindingCategory = (typeof AJNA_FINDING_CATEGORIES)[number]

export const AJNA_MERGE_READINESS_STATUSES = [
  'READY_TO_REVIEW',
  'NEEDS_TEST_EVIDENCE',
  'NEEDS_OPERATOR_DECISION',
  'BLOCKED_BY_RISK',
  'BLOCKED_BY_CI',
  'BLOCKED_BY_SECURITY',
  'BLOCKED_BY_ARCHITECTURE_DRIFT',
  'MERGE_READY_WITH_EVIDENCE',
] as const
export type AjnaMergeReadinessStatus = (typeof AJNA_MERGE_READINESS_STATUSES)[number]

export interface AjnaEvidenceRef {
  readonly evidenceClass: AjnaEvidenceClass
  readonly summary: string
  readonly sourcePath?: string
  readonly sourceUrl?: string
  readonly lineStart?: number
  readonly lineEnd?: number
}

export interface AjnaReviewFinding {
  readonly id: string
  readonly category: AjnaFindingCategory
  readonly risk: AjnaRiskLevel
  readonly title: string
  readonly summary: string
  readonly evidence: readonly AjnaEvidenceRef[]
  readonly affectedFiles: readonly string[]
  readonly recommendation: string
  readonly blocksMerge: boolean
}

export interface AjnaReviewSubject {
  readonly repository: string
  readonly pullRequestNumber?: number
  readonly baseRef: string
  readonly headRef: string
  readonly commitSha?: string
}

export interface AjnaReviewRequest {
  readonly requestId: string
  readonly subject: AjnaReviewSubject
  readonly changedFiles: readonly string[]
  readonly operatorIntent?: string
  readonly requireCiEvidence: boolean
  readonly requireTestEvidence: boolean
}

export interface AjnaMergeReadiness {
  readonly status: AjnaMergeReadinessStatus
  readonly summary: string
  readonly requiredEvidencePresent: boolean
  readonly blockingFindings: readonly string[]
  readonly operatorDecisionRequired: boolean
}

export interface AjnaReviewResponse {
  readonly requestId: string
  readonly subject: AjnaReviewSubject
  readonly tagline: 'See beyond the code.'
  readonly subtitle: 'Expand your vision beyond the diff.'
  readonly findings: readonly AjnaReviewFinding[]
  readonly mergeReadiness: AjnaMergeReadiness
  readonly recommendedNextAction: string
}
