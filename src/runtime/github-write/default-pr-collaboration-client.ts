import type { GitHubHttpClient } from '../live-read/github-http-client.js'
import type { PrCollaborationClient } from './pr-collaboration.js'

function parseOwnerRepo(repository: string): { owner: string; repo: string } {
  const parts = repository.split('/')
  if (parts.length !== 2 || parts[0]!.length === 0 || parts[1]!.length === 0) {
    throw new Error(`Invalid repository format: "${repository}". Expected "owner/repo".`)
  }
  return { owner: parts[0]!, repo: parts[1]! }
}

export class DefaultPrCollaborationClient implements PrCollaborationClient {
  private readonly httpClient: GitHubHttpClient

  constructor(httpClient: GitHubHttpClient) {
    this.httpClient = httpClient
  }

  async addComment(input: {
    readonly repository: string
    readonly prNumber: number
    readonly body: string
  }): Promise<void> {
    const { owner, repo } = parseOwnerRepo(input.repository)

    const response = await this.httpClient.post(
      `/repos/${owner}/${repo}/issues/${input.prNumber}/comments`,
      { body: input.body },
    )
    if (response.status !== 201) {
      throw new Error(`Failed to add comment to PR #${input.prNumber}: status ${response.status}`)
    }
  }

  async addLabel(input: {
    readonly repository: string
    readonly prNumber: number
    readonly label: string
  }): Promise<void> {
    const { owner, repo } = parseOwnerRepo(input.repository)

    const response = await this.httpClient.post(
      `/repos/${owner}/${repo}/issues/${input.prNumber}/labels`,
      { labels: [input.label] },
    )
    if (response.status !== 200) {
      throw new Error(`Failed to add label to PR #${input.prNumber}: status ${response.status}`)
    }
  }
}
