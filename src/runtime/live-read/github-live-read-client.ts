import type { GitHubCiEvidence } from '../adapters/github-ci-read-adapter.js'
import type { GitHubPrEvidence } from '../adapters/github-pr-read-adapter.js'

import type { RepositoryFileResult, RuntimeLiveReadClient } from './runtime-live-read-client.js'

export class GitHubLiveReadClient implements RuntimeLiveReadClient {
  readonly provider = 'github'

  async getPullRequestEvidence(owner: string, repo: string, prNumber: number): Promise<GitHubPrEvidence> {
    throw new Error(
      `Live GitHub PR read not yet wired: ${owner}/${repo}#${prNumber}. ` +
      'A future phase will inject an authenticated HTTP client here.',
    )
  }

  async getWorkflowEvidence(owner: string, repo: string, runId: number): Promise<GitHubCiEvidence> {
    throw new Error(
      `Live GitHub workflow read not yet wired: ${owner}/${repo} run ${runId}. ` +
      'A future phase will inject an authenticated HTTP client here.',
    )
  }

  async getRepositoryFile(owner: string, repo: string, path: string, ref: string): Promise<RepositoryFileResult> {
    throw new Error(
      `Live GitHub file read not yet wired: ${owner}/${repo}/${path}@${ref}. ` +
      'A future phase will inject an authenticated HTTP client here.',
    )
  }
}
