import type { GitHubCiEvidence } from '../adapters/github-ci-read-adapter.js'
import type { GitHubPrEvidence } from '../adapters/github-pr-read-adapter.js'

export interface RepositoryFileResult {
  readonly path: string
  readonly ref: string
  readonly content: string
}

export interface RuntimeLiveReadClient {
  readonly provider: string

  getPullRequestEvidence(owner: string, repo: string, prNumber: number): Promise<GitHubPrEvidence>

  getWorkflowEvidence(owner: string, repo: string, runId: number): Promise<GitHubCiEvidence>

  getRepositoryFile(
    owner: string,
    repo: string,
    path: string,
    ref: string,
  ): Promise<RepositoryFileResult>
}
