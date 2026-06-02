import type { CodemindReadOnlyRepoContext } from '../repo-context/repo-context.types.js'

export interface CodemindGithubReadAdapterTarget {
  readonly repositoryFullName: string
  readonly pullRequestNumber: number
}

export interface CodemindGithubReadAdapterOptions {
  readonly apiBaseUrl: string
  readonly token?: string
}

export interface CodemindGithubReadClient {
  readonly getJson: <T>(path: string) => Promise<T>
}

export interface GithubPullRequestApiPayload {
  readonly number: number
  readonly base: {
    readonly ref: string
    readonly sha: string
    readonly repo: {
      readonly default_branch: string
      readonly full_name: string
      readonly name: string
      readonly owner: {
        readonly login: string
      }
    }
  }
  readonly head: {
    readonly ref: string
    readonly sha: string
  }
}

export interface GithubPullRequestFileApiPayload {
  readonly filename: string
  readonly previous_filename?: string
  readonly status: string
  readonly additions: number
  readonly deletions: number
  readonly patch?: string
}

export interface CodemindGithubReadAdapterResult {
  readonly target: CodemindGithubReadAdapterTarget
  readonly context: CodemindReadOnlyRepoContext
  readonly readOnly: true
  readonly notes: readonly string[]
}
