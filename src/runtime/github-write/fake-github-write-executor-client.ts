import type {
  GitHubWriteExecutorAction,
  GitHubWriteExecutorClient,
  GitHubWriteExecutorClientResult,
} from './github-write-executor.js'

export interface FakeGitHubWriteOperation {
  readonly action: GitHubWriteExecutorAction
  readonly repository: string
  readonly targetRef: string
  readonly content: string
}

export class FakeGitHubWriteExecutorClient implements GitHubWriteExecutorClient {
  readonly operations: FakeGitHubWriteOperation[] = []

  async execute(input: {
    readonly action: GitHubWriteExecutorAction
    readonly repository: string
    readonly targetRef: string
    readonly content: string
  }): Promise<GitHubWriteExecutorClientResult> {
    this.operations.push({
      action: input.action,
      repository: input.repository,
      targetRef: input.targetRef,
      content: input.content,
    })

    switch (input.action) {
      case 'create_draft_pr':
        return {
          operationSummary: `Created draft PR on ${input.repository} targeting ${input.targetRef}`,
          resourceUrl: `https://github.example/${input.repository}/pull/fake-1`,
        }
      case 'post_comment':
        return {
          operationSummary: `Posted comment on ${input.repository} PR #${input.targetRef}`,
          resourceUrl: `https://github.example/${input.repository}/pull/${input.targetRef}#comment-fake`,
        }
      case 'apply_label':
        return {
          operationSummary: `Applied label "${input.content}" on ${input.repository} PR #${input.targetRef}`,
          resourceUrl: null,
        }
    }
  }
}
