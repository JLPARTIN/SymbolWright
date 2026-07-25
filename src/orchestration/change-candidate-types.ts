export const CHANGE_CANDIDATE_STATUSES = [
  'submitted',
  'under-review',
  'approved',
  'rejected',
  'superseded',
  'integrated',
] as const
export type ChangeCandidateStatus = (typeof CHANGE_CANDIDATE_STATUSES)[number]

export interface ChangedFileSummary {
  readonly path: string
  readonly changeType: 'added' | 'modified' | 'deleted' | 'renamed'
  readonly linesAdded: number
  readonly linesRemoved: number
}

export interface EvidenceRef {
  readonly kind: 'validation-result' | 'diff' | 'test-output' | 'review' | 'other'
  readonly description: string
  readonly ref: string
}

export const VALIDATION_OUTCOMES = ['pass', 'fail', 'blocked', 'error'] as const
export type ValidationOutcome = (typeof VALIDATION_OUTCOMES)[number]

export interface ValidationResult {
  readonly command: string
  readonly outcome: ValidationOutcome
  readonly summary: string
  readonly exitCode: number | null
  readonly ranAt: string
}

export interface RiskSummary {
  readonly level: 'low' | 'medium' | 'high' | 'critical'
  readonly notes: readonly string[]
}

/**
 * A submitted unit of agent work. Immutable once submitted (Section 20) — a correction creates a
 * new candidate with `correctsCandidateId` set rather than mutating this one, so the integration
 * engine and audit trail always reference an exact, never-rewritten record.
 */
export interface ChangeCandidate {
  readonly id: string
  readonly missionId: string
  readonly teamId: string
  readonly taskId: string
  readonly agentId: string
  readonly submittedAt: string
  readonly baseSha: string
  readonly workspaceId: string
  readonly branchName?: string
  readonly patchRef?: string
  readonly changedFiles: readonly ChangedFileSummary[]
  readonly rationale: string
  readonly acceptanceEvidence: readonly EvidenceRef[]
  readonly validationResults: readonly ValidationResult[]
  status: ChangeCandidateStatus
  readonly riskSummary: RiskSummary
  readonly correctsCandidateId?: string
  decidedBy?: string
  decidedAt?: string
  decisionRationale?: string
}

export const REVIEW_FINDING_SEVERITIES = [
  'blocking',
  'high',
  'medium',
  'low',
  'suggestion',
] as const
export type ReviewFindingSeverity = (typeof REVIEW_FINDING_SEVERITIES)[number]

export interface ReviewFinding {
  readonly id: string
  readonly severity: ReviewFindingSeverity
  readonly summary: string
  readonly filePath?: string
  readonly line?: number
  status: 'open' | 'fixed' | 'dismissed' | 'overridden'
  dismissedBy?: string
  dismissalEvidence?: string
}

export interface CandidateReview {
  readonly id: string
  readonly candidateId: string
  readonly teamId: string
  readonly reviewerId: string
  readonly createdAt: string
  readonly findings: readonly ReviewFinding[]
  readonly verdict: 'approve' | 'request-changes' | 'reject'
  readonly rationale: string
}

export const CONFLICT_CATEGORIES = [
  'textual-overlap',
  'same-symbol-modification',
  'interface-contract-conflict',
  'dependency-conflict',
  'configuration-conflict',
  'migration-conflict',
  'test-expectation-conflict',
  'architectural-decision-conflict',
  'branch-base-drift',
  'protected-path-conflict',
  'permission-scope-conflict',
] as const
export type ConflictCategory = (typeof CONFLICT_CATEGORIES)[number]

export interface DetectedConflict {
  readonly id: string
  readonly category: ConflictCategory
  readonly candidateIds: readonly string[]
  readonly description: string
  readonly filePaths: readonly string[]
  readonly blocking: boolean
}

export const INTEGRATION_STRATEGIES = [
  'ordered-patch',
  'commit-cherry-pick',
  'squash',
  'reimplementation',
] as const
export type IntegrationStrategy = (typeof INTEGRATION_STRATEGIES)[number]

export const INTEGRATION_STATUSES = [
  'preparing',
  'ready',
  'executing',
  'succeeded',
  'failed',
  'rolled-back',
] as const
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number]

export interface IntegrationStep {
  readonly candidateId: string
  readonly order: number
  status: 'pending' | 'applied' | 'failed' | 'skipped'
  appliedAt?: string
  error?: string
}

export interface IntegrationPlan {
  readonly id: string
  readonly teamId: string
  readonly createdAt: string
  readonly candidateIds: readonly string[]
  readonly strategy: IntegrationStrategy
  readonly steps: readonly IntegrationStep[]
  readonly conflicts: readonly DetectedConflict[]
  readonly canonicalBaseSha: string
  status: IntegrationStatus
}

export interface IntegrationResult {
  readonly planId: string
  readonly status: IntegrationStatus
  readonly integratedCandidateIds: readonly string[]
  readonly skippedCandidateIds: readonly string[]
  readonly validationResults: readonly ValidationResult[]
  readonly checkpointId?: string
  readonly finishedAt: string
  readonly error?: string
}

export interface RollbackResult {
  readonly integrationId: string
  readonly reason: string
  readonly restoredAt: string
  readonly restoredFiles: readonly string[]
}
