export const CODEMIND_REPO_FILE_CHANGE_TYPES = [
  'ADDED',
  'MODIFIED',
  'RENAMED',
  'DELETED',
  'COPIED',
  'UNKNOWN',
] as const;
export type CodemindRepoFileChangeType =
  (typeof CODEMIND_REPO_FILE_CHANGE_TYPES)[number];

export const CODEMIND_REPO_FILE_IMPACT_LEVELS = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
  'UNKNOWN',
] as const;
export type CodemindRepoFileImpactLevel =
  (typeof CODEMIND_REPO_FILE_IMPACT_LEVELS)[number];

export const CODEMIND_EVIDENCE_STATES = [
  'PRESENT',
  'MISSING',
  'FAILED',
  'UNKNOWN',
  'NOT_REQUIRED',
] as const;
export type CodemindEvidenceState = (typeof CODEMIND_EVIDENCE_STATES)[number];

export interface CodemindRepositoryIdentity {
  readonly owner: string;
  readonly name: string;
  readonly fullName: string;
  readonly defaultBranch: string;
}

export interface CodemindRepoRef {
  readonly name: string;
  readonly sha?: string;
}

export interface CodemindChangedFileContext {
  readonly path: string;
  readonly previousPath?: string;
  readonly changeType: CodemindRepoFileChangeType;
  readonly additions: number;
  readonly deletions: number;
  readonly impactLevel: CodemindRepoFileImpactLevel;
  readonly protectedPath: boolean;
  readonly notes: readonly string[];
}

export interface CodemindDiffHunkContext {
  readonly filePath: string;
  readonly hunkHeader: string;
  readonly oldStart?: number;
  readonly oldLines?: number;
  readonly newStart?: number;
  readonly newLines?: number;
  readonly summary?: string;
}

export interface CodemindCiEvidenceContext {
  readonly state: CodemindEvidenceState;
  readonly provider: string;
  readonly workflowName?: string;
  readonly checkName?: string;
  readonly conclusion?: string;
  readonly url?: string;
  readonly notes: readonly string[];
}

export interface CodemindTestEvidenceContext {
  readonly state: CodemindEvidenceState;
  readonly command?: string;
  readonly framework?: string;
  readonly passed?: number;
  readonly failed?: number;
  readonly skipped?: number;
  readonly notes: readonly string[];
}

export interface CodemindReadOnlyRepoContext {
  readonly repository: CodemindRepositoryIdentity;
  readonly baseRef: CodemindRepoRef;
  readonly headRef: CodemindRepoRef;
  readonly changedFiles: readonly CodemindChangedFileContext[];
  readonly diffHunks: readonly CodemindDiffHunkContext[];
  readonly ciEvidence: readonly CodemindCiEvidenceContext[];
  readonly testEvidence: readonly CodemindTestEvidenceContext[];
  readonly contextGeneratedAt: string;
  readonly readOnly: true;
}
