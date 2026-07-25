import {
  assertGithubPrContextIsReadOnly,
  createReadOnlyGithubPrContextResponse,
} from '../github/github-pr-context-contract.js'
import type {
  SymbolWrightGithubPrAdapterMode,
  SymbolWrightGithubPrContextAdapterRequest,
  SymbolWrightGithubPullRequestIdentity,
} from '../github/github-pr-context.types.js'
import type { SymbolWrightReadOnlyRepoContext } from '../repo-context/repo-context.types.js'

export const SYMBOLWRIGHT_GITHUB_ADAPTER_PROOF_BLOCK_ID = 'SYMBOLWRIGHT-PROOF-HARNESS-07' as const
export const SYMBOLWRIGHT_GITHUB_ADAPTER_PROOF_PR_ID = 'PR-CM-TEST-07' as const
export const SYMBOLWRIGHT_GITHUB_ADAPTER_PROOF_PHASE_ID = 'SYMBOLWRIGHT-TEST-07' as const

export const SYMBOLWRIGHT_GITHUB_ADAPTER_PROOF_STATUSES = [
  'GITHUB_ADAPTER_PROOF_READY',
  'GITHUB_ADAPTER_PROOF_PARTIAL',
  'GITHUB_ADAPTER_PROOF_BLOCKED',
  'GITHUB_ADAPTER_PROOF_INVALID',
] as const
export type SymbolWrightGithubAdapterProofStatus =
  (typeof SYMBOLWRIGHT_GITHUB_ADAPTER_PROOF_STATUSES)[number]

export interface SymbolWrightGithubAdapterProofInput {
  readonly adapterMode: SymbolWrightGithubPrAdapterMode
  readonly pullRequest: SymbolWrightGithubPullRequestIdentity
  readonly repoContext: SymbolWrightReadOnlyRepoContext
  readonly blockingNotes?: readonly string[]
}

export interface SymbolWrightGithubAdapterProofReport {
  readonly blockId: typeof SYMBOLWRIGHT_GITHUB_ADAPTER_PROOF_BLOCK_ID
  readonly prId: typeof SYMBOLWRIGHT_GITHUB_ADAPTER_PROOF_PR_ID
  readonly phaseId: typeof SYMBOLWRIGHT_GITHUB_ADAPTER_PROOF_PHASE_ID
  readonly status: SymbolWrightGithubAdapterProofStatus
  readonly adapterMode: SymbolWrightGithubPrAdapterMode
  readonly isReadOnly: boolean
  readonly violations: readonly string[]
  readonly blockingNotes: readonly string[]
  readonly mutationAllowed: false
  readonly githubWriteAllowed: false
  readonly providerInvocationAllowed: false
  readonly summary: string
}

const ALLOWED_MODES: ReadonlySet<SymbolWrightGithubPrAdapterMode> = new Set(['READ_ONLY_CONTRACT'])

function collectViolations(
  adapterMode: SymbolWrightGithubPrAdapterMode,
  pullRequest: SymbolWrightGithubPullRequestIdentity,
  isReadOnly: boolean,
): readonly string[] {
  const violations: string[] = []

  if (!ALLOWED_MODES.has(adapterMode)) {
    violations.push(`Adapter mode '${adapterMode}' is not a safe read-only mode.`)
  }

  if (!pullRequest.repositoryFullName || pullRequest.pullRequestNumber <= 0) {
    violations.push('Pull request identity is incomplete or invalid.')
  }

  if (!isReadOnly) {
    violations.push('Adapter response failed read-only assertion.')
  }

  return violations
}

function resolveStatus(
  blockingNotes: readonly string[],
  violations: readonly string[],
): SymbolWrightGithubAdapterProofStatus {
  if (blockingNotes.length > 0) {
    return 'GITHUB_ADAPTER_PROOF_BLOCKED'
  }
  if (violations.length > 0) {
    return 'GITHUB_ADAPTER_PROOF_INVALID'
  }
  return 'GITHUB_ADAPTER_PROOF_READY'
}

export function buildSymbolWrightGithubAdapterProofReport(
  input: SymbolWrightGithubAdapterProofInput,
): SymbolWrightGithubAdapterProofReport {
  const blockingNotes = [...(input.blockingNotes ?? [])].sort((a, b) => a.localeCompare(b))

  const request: SymbolWrightGithubPrContextAdapterRequest = {
    requestId: `proof-${input.pullRequest.pullRequestNumber}`,
    adapterMode: input.adapterMode,
    pullRequest: input.pullRequest,
    requestedInputs: ['PULL_REQUEST_METADATA', 'CHANGED_FILES'],
    includeReviewCommentContext: false,
    includeCiEvidence: true,
    includeTestEvidence: true,
  }

  const response = createReadOnlyGithubPrContextResponse(request, input.repoContext)
  const isReadOnly = assertGithubPrContextIsReadOnly(response)

  const violations = collectViolations(input.adapterMode, input.pullRequest, isReadOnly)
  const status = resolveStatus(blockingNotes, violations)

  const summary =
    status === 'GITHUB_ADAPTER_PROOF_BLOCKED'
      ? `GitHub adapter proof blocked: ${blockingNotes.length} blocking note(s).`
      : status === 'GITHUB_ADAPTER_PROOF_INVALID'
        ? `GitHub adapter proof invalid: ${violations.length} violation(s).`
        : 'GitHub adapter proof ready: read-only contract verified.'

  return {
    blockId: SYMBOLWRIGHT_GITHUB_ADAPTER_PROOF_BLOCK_ID,
    prId: SYMBOLWRIGHT_GITHUB_ADAPTER_PROOF_PR_ID,
    phaseId: SYMBOLWRIGHT_GITHUB_ADAPTER_PROOF_PHASE_ID,
    status,
    adapterMode: input.adapterMode,
    isReadOnly,
    violations,
    blockingNotes,
    mutationAllowed: false,
    githubWriteAllowed: false,
    providerInvocationAllowed: false,
    summary,
  }
}
