import type { GitHubCiEvidence } from '../adapters/github-ci-read-adapter.js'
import type { GitHubPrEvidence } from '../adapters/github-pr-read-adapter.js'

import type { RepositoryFileResult, RuntimeLiveReadClient } from './runtime-live-read-client.js'

export interface FakeLiveReadClientData {
  readonly pr?: GitHubPrEvidence
  readonly ci?: GitHubCiEvidence
  readonly files?: readonly RepositoryFileResult[]
}

export class FakeLiveReadClient implements RuntimeLiveReadClient {
  readonly provider = 'fake'
  private readonly data: FakeLiveReadClientData

  constructor(data: FakeLiveReadClientData) {
    this.data = data
  }

  async getPullRequestEvidence(
    _owner: string,
    _repo: string,
    _prNumber: number,
  ): Promise<GitHubPrEvidence> {
    if (this.data.pr === undefined) {
      throw new Error('Fake client has no PR evidence configured.')
    }
    return this.data.pr
  }

  async getWorkflowEvidence(
    _owner: string,
    _repo: string,
    _runId: number,
  ): Promise<GitHubCiEvidence> {
    if (this.data.ci === undefined) {
      throw new Error('Fake client has no CI evidence configured.')
    }
    return this.data.ci
  }

  async getRepositoryFile(
    _owner: string,
    _repo: string,
    path: string,
    ref: string,
  ): Promise<RepositoryFileResult> {
    const match = (this.data.files ?? []).find((f) => f.path === path && f.ref === ref)
    if (match === undefined) {
      throw new Error(`Fake client has no file configured for path=${path} ref=${ref}.`)
    }
    return match
  }
}
