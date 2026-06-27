import type { GitHubHttpClient } from '../live-read/github-http-client.js'
import type {
  GitHubWriteExecutorAction,
  GitHubWriteExecutorClient,
  GitHubWriteExecutorClientResult,
} from './github-write-executor.js'

function parseOwnerRepo(repository: string): { owner: string; repo: string } {
  const parts = repository.split('/')
  if (parts.length !== 2 || parts[0]!.length === 0 || parts[1]!.length === 0) {
    throw new Error(`Invalid repository format: "${repository}". Expected "owner/repo".`)
  }
  return { owner: parts[0]!, repo: parts[1]! }
}

export class DefaultGitHubWriteExecutorClient implements GitHubWriteExecutorClient {
  private readonly httpClient: GitHubHttpClient

  constructor(httpClient: GitHubHttpClient) {
    this.httpClient = httpClient
  }

  async execute(input: {
    readonly action: GitHubWriteExecutorAction
    readonly repository: string
    readonly targetRef: string
    readonly content: string
  }): Promise<GitHubWriteExecutorClientResult> {
    switch (input.action) {
      case 'create_draft_pr':
        return this.createDraftPr(input)
      case 'post_comment':
        return this.postComment(input)
      case 'apply_label':
        return this.applyLabel(input)
    }
  }

  private async createDraftPr(input: {
    readonly repository: string
    readonly targetRef: string
    readonly content: string
  }): Promise<GitHubWriteExecutorClientResult> {
    const { owner, repo } = parseOwnerRepo(input.repository)
    const lines = input.content.split('\n')
    const title = lines[0] ?? 'Draft PR'
    const body = lines.slice(1).join('\n').trim()

    const response = await this.httpClient.post(`/repos/${owner}/${repo}/pulls`, {
      title,
      body,
      head: input.targetRef,
      base: 'main',
      draft: true,
    })
    if (response.status !== 201) {
      throw new Error(`Failed to create draft PR: status ${response.status}`)
    }

    const prBody = response.body as Record<string, unknown>
    return {
      operationSummary: `Created draft PR on ${input.repository} targeting ${input.targetRef}`,
      resourceUrl: String(prBody['html_url'] ?? ''),
    }
  }

  private async postComment(input: {
    readonly repository: string
    readonly targetRef: string
    readonly content: string
  }): Promise<GitHubWriteExecutorClientResult> {
    const { owner, repo } = parseOwnerRepo(input.repository)
    const prNumber = input.targetRef

    const response = await this.httpClient.post(
      `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
      { body: input.content },
    )
    if (response.status !== 201) {
      throw new Error(`Failed to post comment: status ${response.status}`)
    }

    const commentBody = response.body as Record<string, unknown>
    return {
      operationSummary: `Posted comment on ${input.repository} PR #${prNumber}`,
      resourceUrl: String(commentBody['html_url'] ?? ''),
    }
  }

  private async applyLabel(input: {
    readonly repository: string
    readonly targetRef: string
    readonly content: string
  }): Promise<GitHubWriteExecutorClientResult> {
    const { owner, repo } = parseOwnerRepo(input.repository)
    const prNumber = input.targetRef

    const response = await this.httpClient.post(
      `/repos/${owner}/${repo}/issues/${prNumber}/labels`,
      { labels: [input.content] },
    )
    if (response.status !== 200) {
      throw new Error(`Failed to apply label: status ${response.status}`)
    }

    return {
      operationSummary: `Applied label "${input.content}" on ${input.repository} PR #${prNumber}`,
      resourceUrl: null,
    }
  }
}
