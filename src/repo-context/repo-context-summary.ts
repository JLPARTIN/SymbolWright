import type {
  SymbolWrightChangedFileContext,
  SymbolWrightEvidenceState,
  SymbolWrightReadOnlyRepoContext,
  SymbolWrightRepoFileImpactLevel,
} from './repo-context.types.js'

const IMPACT_RANK: Record<SymbolWrightRepoFileImpactLevel, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
  UNKNOWN: 0,
}

export function countProtectedChangedFiles(
  changedFiles: readonly SymbolWrightChangedFileContext[],
): number {
  return changedFiles.filter((file) => file.protectedPath).length
}

export function getHighestRepoImpactLevel(
  changedFiles: readonly SymbolWrightChangedFileContext[],
): SymbolWrightRepoFileImpactLevel {
  if (changedFiles.length === 0) {
    return 'UNKNOWN'
  }

  return changedFiles.reduce<SymbolWrightRepoFileImpactLevel>((highest, file) => {
    return IMPACT_RANK[file.impactLevel] > IMPACT_RANK[highest] ? file.impactLevel : highest
  }, 'UNKNOWN')
}

export function hasRequiredEvidenceState(states: readonly SymbolWrightEvidenceState[]): boolean {
  return (
    states.length > 0 && states.every((state) => state === 'PRESENT' || state === 'NOT_REQUIRED')
  )
}

export interface SymbolWrightRepoContextSummary {
  readonly repository: string
  readonly baseRef: string
  readonly headRef: string
  readonly changedFileCount: number
  readonly protectedChangedFileCount: number
  readonly highestImpactLevel: SymbolWrightRepoFileImpactLevel
  readonly ciEvidenceSatisfied: boolean
  readonly testEvidenceSatisfied: boolean
  readonly readOnly: true
}

export function summarizeReadOnlyRepoContext(
  context: SymbolWrightReadOnlyRepoContext,
): SymbolWrightRepoContextSummary {
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
  }
}
