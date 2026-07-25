import type { SymbolWrightReadOnlyRepoContext } from '../repo-context/repo-context.types.js'

export const SYMBOLWRIGHT_GITHUB_PR_ADAPTER_MODES = [
  'READ_ONLY_CONTRACT',
  'READ_ONLY_RUNTIME_FUTURE',
] as const
export type SymbolWrightGithubPrAdapterMode = (typeof SYMBOLWRIGHT_GITHUB_PR_ADAPTER_MODES)[number]

export const SYMBOLWRIGHT_GITHUB_PR_CONTEXT_INPUTS = [
  'PULL_REQUEST_METADATA',
  'CHANGED_FILES',
  'DIFF_SUMMARY',
  'CI_STATUS',
  'TEST_STATUS',
  'REVIEW_COMMENTS_CONTEXT',
] as const
export type SymbolWrightGithubPrContextInput =
  (typeof SYMBOLWRIGHT_GITHUB_PR_CONTEXT_INPUTS)[number]

export interface SymbolWrightGithubPullRequestIdentity {
  readonly repositoryFullName: string
  readonly pullRequestNumber: number
  readonly baseRef: string
  readonly headRef: string
  readonly headSha?: string
}

export interface SymbolWrightGithubPrContextAdapterRequest {
  readonly requestId: string
  readonly adapterMode: SymbolWrightGithubPrAdapterMode
  readonly pullRequest: SymbolWrightGithubPullRequestIdentity
  readonly requestedInputs: readonly SymbolWrightGithubPrContextInput[]
  readonly includeReviewCommentContext: boolean
  readonly includeCiEvidence: boolean
  readonly includeTestEvidence: boolean
}

export interface SymbolWrightGithubPrContextAdapterResponse {
  readonly requestId: string
  readonly pullRequest: SymbolWrightGithubPullRequestIdentity
  readonly context: SymbolWrightReadOnlyRepoContext
  readonly adapterMode: SymbolWrightGithubPrAdapterMode
  readonly readOnly: true
  readonly githubWriteEnabled: false
  readonly commentsEnabled: false
  readonly mergeEnabled: false
  readonly networkRuntimeImplemented: false
  readonly notes: readonly string[]
}
