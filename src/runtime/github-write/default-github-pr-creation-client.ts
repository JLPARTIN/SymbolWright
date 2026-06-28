import type { GitHubHttpClient } from '../live-read/github-http-client.js'
import type { GitHubPrCreationClient, GitHubPrCreationFile } from './github-pr-creation.js'

function parseOwnerRepo(repository: string): { owner: string; repo: string } {
  const parts = repository.split('/')
  if (parts.length !== 2 || parts[0]!.length === 0 || parts[1]!.length === 0) {
    throw new Error(`Invalid repository format: "${repository}". Expected "owner/repo".`)
  }
  return { owner: parts[0]!, repo: parts[1]! }
}

export class DefaultGitHubPrCreationClient implements GitHubPrCreationClient {
  private readonly httpClient: GitHubHttpClient

  constructor(httpClient: GitHubHttpClient) {
    this.httpClient = httpClient
  }

  async createBranch(input: {
    readonly repository: string
    readonly baseBranch: string
    readonly headBranch: string
  }): Promise<void> {
    const { owner, repo } = parseOwnerRepo(input.repository)

    const refResponse = await this.httpClient.get(
      `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(input.baseBranch)}`,
    )
    if (refResponse.status !== 200) {
      throw new Error(
        `Failed to resolve base branch "${input.baseBranch}": status ${refResponse.status}`,
      )
    }

    const refBody = refResponse.body as Record<string, unknown>
    const obj = refBody['object'] as Record<string, unknown> | undefined
    const sha = String(obj?.['sha'] ?? '')
    if (sha.length === 0) {
      throw new Error(`Could not resolve SHA for base branch "${input.baseBranch}"`)
    }

    const createResponse = await this.httpClient.post(`/repos/${owner}/${repo}/git/refs`, {
      ref: `refs/heads/${input.headBranch}`,
      sha,
    })
    if (createResponse.status !== 201) {
      throw new Error(
        `Failed to create branch "${input.headBranch}": status ${createResponse.status}`,
      )
    }
  }

  async commitFiles(input: {
    readonly repository: string
    readonly branch: string
    readonly files: readonly GitHubPrCreationFile[]
    readonly message: string
  }): Promise<void> {
    const { owner, repo } = parseOwnerRepo(input.repository)

    const refResponse = await this.httpClient.get(
      `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(input.branch)}`,
    )
    if (refResponse.status !== 200) {
      throw new Error(`Failed to resolve branch "${input.branch}": status ${refResponse.status}`)
    }
    const refBody = refResponse.body as Record<string, unknown>
    const refObj = refBody['object'] as Record<string, unknown> | undefined
    const parentSha = String(refObj?.['sha'] ?? '')

    const treeItems = input.files.map((file) => ({
      path: file.path,
      mode: '100644' as const,
      type: 'blob' as const,
      content: file.content,
    }))

    const treeResponse = await this.httpClient.post(`/repos/${owner}/${repo}/git/trees`, {
      base_tree: parentSha,
      tree: treeItems,
    })
    if (treeResponse.status !== 201) {
      throw new Error(`Failed to create tree: status ${treeResponse.status}`)
    }
    const treeBody = treeResponse.body as Record<string, unknown>
    const treeSha = String(treeBody['sha'] ?? '')

    const commitResponse = await this.httpClient.post(`/repos/${owner}/${repo}/git/commits`, {
      message: input.message,
      tree: treeSha,
      parents: [parentSha],
    })
    if (commitResponse.status !== 201) {
      throw new Error(`Failed to create commit: status ${commitResponse.status}`)
    }
    const commitBody = commitResponse.body as Record<string, unknown>
    const commitSha = String(commitBody['sha'] ?? '')

    const updateRefResponse = await this.httpClient.post(
      `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(input.branch)}`,
      { sha: commitSha },
    )
    if (updateRefResponse.status !== 200 && updateRefResponse.status !== 201) {
      throw new Error(`Failed to update ref: status ${updateRefResponse.status}`)
    }
  }

  async createPullRequest(input: {
    readonly repository: string
    readonly baseBranch: string
    readonly headBranch: string
    readonly title: string
    readonly body: string
    readonly draft: boolean
  }): Promise<{ readonly url: string }> {
    const { owner, repo } = parseOwnerRepo(input.repository)

    const response = await this.httpClient.post(`/repos/${owner}/${repo}/pulls`, {
      title: input.title,
      body: input.body,
      head: input.headBranch,
      base: input.baseBranch,
      draft: input.draft,
    })
    if (response.status !== 201) {
      throw new Error(`Failed to create pull request: status ${response.status}`)
    }

    const prBody = response.body as Record<string, unknown>
    return { url: String(prBody['html_url'] ?? '') }
  }
}
