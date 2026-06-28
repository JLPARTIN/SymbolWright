import type { GitHubPrCreationClient, GitHubPrCreationFile } from './github-pr-creation.js'

export type FakeGitHubPrCreationOperation =
  | {
      readonly type: 'createBranch'
      readonly repository: string
      readonly baseBranch: string
      readonly headBranch: string
    }
  | {
      readonly type: 'commitFiles'
      readonly repository: string
      readonly branch: string
      readonly files: readonly GitHubPrCreationFile[]
      readonly message: string
    }
  | {
      readonly type: 'createPullRequest'
      readonly repository: string
      readonly baseBranch: string
      readonly headBranch: string
      readonly title: string
      readonly body: string
      readonly draft: boolean
    }

export class FakeGitHubPrCreationClient implements GitHubPrCreationClient {
  readonly operations: FakeGitHubPrCreationOperation[] = []

  async createBranch(input: {
    readonly repository: string
    readonly baseBranch: string
    readonly headBranch: string
  }): Promise<void> {
    this.operations.push({
      type: 'createBranch',
      repository: input.repository,
      baseBranch: input.baseBranch,
      headBranch: input.headBranch,
    })
  }

  async commitFiles(input: {
    readonly repository: string
    readonly branch: string
    readonly files: readonly GitHubPrCreationFile[]
    readonly message: string
  }): Promise<void> {
    this.operations.push({
      type: 'commitFiles',
      repository: input.repository,
      branch: input.branch,
      files: input.files,
      message: input.message,
    })
  }

  async createPullRequest(input: {
    readonly repository: string
    readonly baseBranch: string
    readonly headBranch: string
    readonly title: string
    readonly body: string
    readonly draft: boolean
  }): Promise<{ readonly url: string }> {
    this.operations.push({
      type: 'createPullRequest',
      repository: input.repository,
      baseBranch: input.baseBranch,
      headBranch: input.headBranch,
      title: input.title,
      body: input.body,
      draft: input.draft,
    })

    return {
      url: `https://github.example/${input.repository}/pull/fake-${input.headBranch}`,
    }
  }
}
