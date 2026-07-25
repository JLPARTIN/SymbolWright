export const SYMBOLWRIGHT_REPO_FILE_CHANGE_TYPES = [
  'ADDED',
  'MODIFIED',
  'RENAMED',
  'DELETED',
  'COPIED',
  'UNKNOWN',
] as const
export type SymbolWrightRepoFileChangeType = (typeof SYMBOLWRIGHT_REPO_FILE_CHANGE_TYPES)[number]

export const SYMBOLWRIGHT_REPO_FILE_IMPACT_LEVELS = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
  'UNKNOWN',
] as const
export type SymbolWrightRepoFileImpactLevel = (typeof SYMBOLWRIGHT_REPO_FILE_IMPACT_LEVELS)[number]

export const SYMBOLWRIGHT_EVIDENCE_STATES = [
  'PRESENT',
  'MISSING',
  'FAILED',
  'UNKNOWN',
  'NOT_REQUIRED',
] as const
export type SymbolWrightEvidenceState = (typeof SYMBOLWRIGHT_EVIDENCE_STATES)[number]

export interface SymbolWrightRepositoryIdentity {
  readonly owner: string
  readonly name: string
  readonly fullName: string
  readonly defaultBranch: string
}

export interface SymbolWrightRepoRef {
  readonly name: string
  readonly sha?: string
}

export interface SymbolWrightChangedFileContext {
  readonly path: string
  readonly previousPath?: string
  readonly changeType: SymbolWrightRepoFileChangeType
  readonly additions: number
  readonly deletions: number
  readonly impactLevel: SymbolWrightRepoFileImpactLevel
  readonly protectedPath: boolean
  readonly notes: readonly string[]
}

export interface SymbolWrightDiffHunkContext {
  readonly filePath: string
  readonly hunkHeader: string
  readonly oldStart?: number
  readonly oldLines?: number
  readonly newStart?: number
  readonly newLines?: number
  readonly summary?: string
}

export interface SymbolWrightCiEvidenceContext {
  readonly state: SymbolWrightEvidenceState
  readonly provider: string
  readonly workflowName?: string
  readonly checkName?: string
  readonly conclusion?: string
  readonly url?: string
  readonly notes: readonly string[]
}

export interface SymbolWrightTestEvidenceContext {
  readonly state: SymbolWrightEvidenceState
  readonly command?: string
  readonly framework?: string
  readonly passed?: number
  readonly failed?: number
  readonly skipped?: number
  readonly notes: readonly string[]
}

export interface SymbolWrightReadOnlyRepoContext {
  readonly repository: SymbolWrightRepositoryIdentity
  readonly baseRef: SymbolWrightRepoRef
  readonly headRef: SymbolWrightRepoRef
  readonly changedFiles: readonly SymbolWrightChangedFileContext[]
  readonly diffHunks: readonly SymbolWrightDiffHunkContext[]
  readonly ciEvidence: readonly SymbolWrightCiEvidenceContext[]
  readonly testEvidence: readonly SymbolWrightTestEvidenceContext[]
  readonly contextGeneratedAt: string
  readonly readOnly: true
}
