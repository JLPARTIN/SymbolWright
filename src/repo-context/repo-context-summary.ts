import type {
  CodemindChangedFileContext,
  CodemindEvidenceState,
  CodemindReadOnlyRepoContext,
  CodemindRepoFileImpactLevel,
} from './repo-context.types.js';

const IMPACT_RANK: Record<CodemindRepoFileImpactLevel, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
  UNKNOWN: 0,
};

export function countProtectedChangedFiles(
  changedFiles: readonly CodemindChangedFileContext[],
): number {
  return changedFiles.filter((file) => file.protectedPath).length;
}

export function getHighestRepoImpactLevel(
  changedFiles: readonly CodemindChangedFileContext[],
): CodemindRepoFileImpactLevel {
  if (changedFiles.length === 0) {
    return 'UNKNOWN';
  }

  return changedFiles.reduce<CodemindRepoFileImpactLevel>((highest, file) => {
    return IMPACT_RANK[file.impactLevel] > IMPACT_RANK[highest]
      ? file.impactLevel
      : highest;
  }, 'UNKNOWN');
}

export function hasRequiredEvidenceState(
  states: readonly CodemindEvidenceState[],
): boolean {
  return states.length > 0 && states.every((state) => state === 'PRESENT' || state === 'NOT_REQUIRED');
}

export interface CodemindRepoContextSummary {
  readonly repository: string;
  readonly baseRef: string;
  readonly headRef: string;
  readonly changedFileCount: number;
  readonly protectedChangedFileCount: number;
  readonly highestImpactLevel: CodemindRepoFileImpactLevel;
  readonly ciEvidenceSatisfied: boolean;
  readonly testEvidenceSatisfied: boolean;
  readonly readOnly: true;
}

export function summarizeReadOnlyRepoContext(
  context: CodemindReadOnlyRepoContext,
): CodemindRepoContextSummary {
  return {
    repository: context.repository.fullName,
    baseRef: context.baseRef.name,
    headRef: context.headRef.name,
    changedFileCount: context.changedFiles.length,
    protectedChangedFileCount: countProtectedChangedFiles(context.changedFiles),
    highestImpactLevel: getHighestRepoImpactLevel(context.changedFiles),
    ciEvidenceSatisfied: hasRequiredEvidenceState(
      context.ciEvidence.map((evidence) => evidence.state),
    ),
    testEvidenceSatisfied: hasRequiredEvidenceState(
      context.testEvidence.map((evidence) => evidence.state),
    ),
    readOnly: true,
  };
}
