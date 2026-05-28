import type { CodemindReadOnlyRepoContext } from '../repo-context/repo-context.types.js';

export const CODEMIND_GITHUB_PR_ADAPTER_MODES = [
  'READ_ONLY_CONTRACT',
  'READ_ONLY_RUNTIME_FUTURE',
] as const;
export type CodemindGithubPrAdapterMode =
  (typeof CODEMIND_GITHUB_PR_ADAPTER_MODES)[number];

export const CODEMIND_GITHUB_PR_CONTEXT_INPUTS = [
  'PULL_REQUEST_METADATA',
  'CHANGED_FILES',
  'DIFF_SUMMARY',
  'CI_STATUS',
  'TEST_STATUS',
  'REVIEW_COMMENTS_CONTEXT',
] as const;
export type CodemindGithubPrContextInput =
  (typeof CODEMIND_GITHUB_PR_CONTEXT_INPUTS)[number];

export interface CodemindGithubPullRequestIdentity {
  readonly repositoryFullName: string;
  readonly pullRequestNumber: number;
  readonly baseRef: string;
  readonly headRef: string;
  readonly headSha?: string;
}

export interface CodemindGithubPrContextAdapterRequest {
  readonly requestId: string;
  readonly adapterMode: CodemindGithubPrAdapterMode;
  readonly pullRequest: CodemindGithubPullRequestIdentity;
  readonly requestedInputs: readonly CodemindGithubPrContextInput[];
  readonly includeReviewCommentContext: boolean;
  readonly includeCiEvidence: boolean;
  readonly includeTestEvidence: boolean;
}

export interface CodemindGithubPrContextAdapterResponse {
  readonly requestId: string;
  readonly pullRequest: CodemindGithubPullRequestIdentity;
  readonly context: CodemindReadOnlyRepoContext;
  readonly adapterMode: CodemindGithubPrAdapterMode;
  readonly readOnly: true;
  readonly githubWriteEnabled: false;
  readonly commentsEnabled: false;
  readonly mergeEnabled: false;
  readonly networkRuntimeImplemented: false;
  readonly notes: readonly string[];
}
