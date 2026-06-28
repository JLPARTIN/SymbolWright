import type { GitHubCiEvidence } from '../adapters/github-ci-read-adapter.js'
import type { GitHubPrEvidence } from '../adapters/github-pr-read-adapter.js'
import { evaluateLiveReadPolicy, type LiveReadPolicyRequest } from '../policy/live-read-policy.js'

import type { RepositoryFileResult, RuntimeLiveReadClient } from './runtime-live-read-client.js'

export class GitHubLiveReadPolicyWrapper implements RuntimeLiveReadClient {
  readonly provider: string
  private readonly inner: RuntimeLiveReadClient

  constructor(inner: RuntimeLiveReadClient) {
    this.provider = inner.provider
    this.inner = inner
  }

  async getPullRequestEvidence(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<GitHubPrEvidence> {
    this.requirePolicy(['pr:read'], `read PR ${owner}/${repo}#${prNumber}`)
    return this.inner.getPullRequestEvidence(owner, repo, prNumber)
  }

  async getWorkflowEvidence(owner: string, repo: string, runId: number): Promise<GitHubCiEvidence> {
    this.requirePolicy(['checks:read'], `read workflow ${owner}/${repo} run ${runId}`)
    return this.inner.getWorkflowEvidence(owner, repo, runId)
  }

  async getRepositoryFile(
    owner: string,
    repo: string,
    path: string,
    ref: string,
  ): Promise<RepositoryFileResult> {
    this.requirePolicy(['contents:read'], `read file ${owner}/${repo}/${path}@${ref}`)
    return this.inner.getRepositoryFile(owner, repo, path, ref)
  }

  private requirePolicy(scopes: readonly string[], purpose: string): void {
    const request: LiveReadPolicyRequest = {
      provider: 'github',
      purpose,
      scopes,
      dryRun: true,
    }

    const decision = evaluateLiveReadPolicy(request)
    if (!decision.allowed) {
      throw new Error(`Live read policy blocked: ${decision.reason}`)
    }
  }
}
