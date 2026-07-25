import {
  countProtectedChangedFiles,
  getHighestRepoImpactLevel,
  summarizeReadOnlyRepoContext,
} from '../repo-context/repo-context-summary.js'
import type {
  CodemindReadOnlyRepoContext,
  CodemindRepoFileImpactLevel,
} from '../repo-context/repo-context.types.js'

export const CODEMIND_REPO_CONTEXT_PROOF_BLOCK_ID = 'CODEMIND-PROOF-HARNESS-04' as const
export const CODEMIND_REPO_CONTEXT_PROOF_PR_ID = 'PR-CM-TEST-04' as const
export const CODEMIND_REPO_CONTEXT_PROOF_PHASE_ID = 'CODEMIND-TEST-04' as const

export const CODEMIND_REPO_CONTEXT_PROOF_STATUSES = [
  'REPO_CONTEXT_PROOF_READY',
  'REPO_CONTEXT_PROOF_PARTIAL',
  'REPO_CONTEXT_PROOF_BLOCKED',
  'REPO_CONTEXT_PROOF_INVALID',
] as const
export type CodemindRepoContextProofStatus = (typeof CODEMIND_REPO_CONTEXT_PROOF_STATUSES)[number]

export interface CodemindRepoContextProofInput {
  readonly repoContext: CodemindReadOnlyRepoContext
  readonly blockingNotes?: readonly string[]
}

export interface CodemindRepoContextProofReport {
  readonly blockId: typeof CODEMIND_REPO_CONTEXT_PROOF_BLOCK_ID
  readonly prId: typeof CODEMIND_REPO_CONTEXT_PROOF_PR_ID
  readonly phaseId: typeof CODEMIND_REPO_CONTEXT_PROOF_PHASE_ID
  readonly status: CodemindRepoContextProofStatus
  readonly changedFileCount: number
  readonly protectedFileCount: number
  readonly highestImpactLevel: CodemindRepoFileImpactLevel
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
): CodemindRepoContextProofStatus {
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

export function buildCodemindRepoContextProofReport(
  input: CodemindRepoContextProofInput,
): CodemindRepoContextProofReport {
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
    blockId: CODEMIND_REPO_CONTEXT_PROOF_BLOCK_ID,
    prId: CODEMIND_REPO_CONTEXT_PROOF_PR_ID,
    phaseId: CODEMIND_REPO_CONTEXT_PROOF_PHASE_ID,
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
