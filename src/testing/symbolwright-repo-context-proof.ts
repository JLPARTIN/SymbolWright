import {
  countProtectedChangedFiles,
  getHighestRepoImpactLevel,
  summarizeReadOnlyRepoContext,
} from '../repo-context/repo-context-summary.js'
import type {
  SymbolWrightReadOnlyRepoContext,
  SymbolWrightRepoFileImpactLevel,
} from '../repo-context/repo-context.types.js'

export const SYMBOLWRIGHT_REPO_CONTEXT_PROOF_BLOCK_ID = 'SYMBOLWRIGHT-PROOF-HARNESS-04' as const
export const SYMBOLWRIGHT_REPO_CONTEXT_PROOF_PR_ID = 'PR-CM-TEST-04' as const
export const SYMBOLWRIGHT_REPO_CONTEXT_PROOF_PHASE_ID = 'SYMBOLWRIGHT-TEST-04' as const

export const SYMBOLWRIGHT_REPO_CONTEXT_PROOF_STATUSES = [
  'REPO_CONTEXT_PROOF_READY',
  'REPO_CONTEXT_PROOF_PARTIAL',
  'REPO_CONTEXT_PROOF_BLOCKED',
  'REPO_CONTEXT_PROOF_INVALID',
] as const
export type SymbolWrightRepoContextProofStatus =
  (typeof SYMBOLWRIGHT_REPO_CONTEXT_PROOF_STATUSES)[number]

export interface SymbolWrightRepoContextProofInput {
  readonly repoContext: SymbolWrightReadOnlyRepoContext
  readonly blockingNotes?: readonly string[]
}

export interface SymbolWrightRepoContextProofReport {
  readonly blockId: typeof SYMBOLWRIGHT_REPO_CONTEXT_PROOF_BLOCK_ID
  readonly prId: typeof SYMBOLWRIGHT_REPO_CONTEXT_PROOF_PR_ID
  readonly phaseId: typeof SYMBOLWRIGHT_REPO_CONTEXT_PROOF_PHASE_ID
  readonly status: SymbolWrightRepoContextProofStatus
  readonly changedFileCount: number
  readonly protectedFileCount: number
  readonly highestImpactLevel: SymbolWrightRepoFileImpactLevel
  readonly ciEvidenceSatisfied: boolean
  readonly testEvidenceSatisfied: boolean
  readonly blockingNotes: readonly string[]
  readonly mutationAllowed: false
  readonly githubWriteAllowed: false
  readonly providerInvocationAllowed: false
  readonly summary: string
}

function resolveStatus(
  blockingNotes: readonly string[],
  ciEvidenceSatisfied: boolean,
  testEvidenceSatisfied: boolean,
  changedFileCount: number,
): SymbolWrightRepoContextProofStatus {
  if (blockingNotes.length > 0) {
    return 'REPO_CONTEXT_PROOF_BLOCKED'
  }
  if (changedFileCount === 0) {
    return 'REPO_CONTEXT_PROOF_INVALID'
  }
  if (ciEvidenceSatisfied && testEvidenceSatisfied) {
    return 'REPO_CONTEXT_PROOF_READY'
  }
  return 'REPO_CONTEXT_PROOF_PARTIAL'
}

export function buildSymbolWrightRepoContextProofReport(
  input: SymbolWrightRepoContextProofInput,
): SymbolWrightRepoContextProofReport {
  const blockingNotes = [...(input.blockingNotes ?? [])].sort((a, b) => a.localeCompare(b))

  const summary = summarizeReadOnlyRepoContext(input.repoContext)
  const { changedFileCount, ciEvidenceSatisfied, testEvidenceSatisfied } = summary
  const protectedFileCount = countProtectedChangedFiles(input.repoContext.changedFiles)
  const highestImpactLevel = getHighestRepoImpactLevel(input.repoContext.changedFiles)

  const status = resolveStatus(
    blockingNotes,
    ciEvidenceSatisfied,
    testEvidenceSatisfied,
    changedFileCount,
  )

  const statusSummary =
    status === 'REPO_CONTEXT_PROOF_BLOCKED'
      ? `Repo context proof blocked: ${blockingNotes.length} blocking note(s).`
      : status === 'REPO_CONTEXT_PROOF_INVALID'
        ? 'Repo context proof invalid: no changed files in context.'
        : status === 'REPO_CONTEXT_PROOF_READY'
          ? `Repo context proof ready: ${changedFileCount} file(s) changed, CI and test evidence satisfied.`
          : `Repo context proof partial: ${changedFileCount} file(s) changed, evidence incomplete (CI: ${ciEvidenceSatisfied}, tests: ${testEvidenceSatisfied}).`

  return {
    blockId: SYMBOLWRIGHT_REPO_CONTEXT_PROOF_BLOCK_ID,
    prId: SYMBOLWRIGHT_REPO_CONTEXT_PROOF_PR_ID,
    phaseId: SYMBOLWRIGHT_REPO_CONTEXT_PROOF_PHASE_ID,
    status,
    changedFileCount,
    protectedFileCount,
    highestImpactLevel,
    ciEvidenceSatisfied,
    testEvidenceSatisfied,
    blockingNotes,
    mutationAllowed: false,
    githubWriteAllowed: false,
    providerInvocationAllowed: false,
    summary: statusSummary,
  }
}
