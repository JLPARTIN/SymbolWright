import type { GitHubCiEvidence } from '../adapters/github-ci-read-adapter.js'
import type { GitHubPrEvidence } from '../adapters/github-pr-read-adapter.js'

import type { GitHubHttpClient } from './github-http-client.js'
import { redactGitHubContent } from './github-live-read-redaction.js'
import type { RepositoryFileResult, RuntimeLiveReadClient } from './runtime-live-read-client.js'

function assertGitHubApiObject(body: unknown, context: string): Record<string, unknown> {
  if (typeof body !== 'object' || body === null) {
    throw new Error(`GitHub API response is not an object (${context})`)
  }
  return body as Record<string, unknown>
}

export class GitHubLiveReadClient implements RuntimeLiveReadClient {
  readonly provider = 'github'
  private readonly httpClient: GitHubHttpClient | undefined

  constructor(httpClient?: GitHubHttpClient) {
    this.httpClient = httpClient
  }

  async getPullRequestEvidence(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<GitHubPrEvidence> {
    if (this.httpClient === undefined) {
      throw new Error(
        `No GitHub HTTP client configured for PR read: ${owner}/${repo}#${prNumber}. ` +
          'Provide a GITHUB_TOKEN to enable live reads.',
      )
    }

    const response = await this.httpClient.get(`/repos/${owner}/${repo}/pulls/${prNumber}`)

    if (response.status !== 200) {
      throw new Error(`GitHub API returned ${response.status} for PR ${owner}/${repo}#${prNumber}`)
    }

    const pr = assertGitHubApiObject(response.body, `PR ${owner}/${repo}#${prNumber}`)
    const base =
      typeof pr['base'] === 'object' && pr['base'] !== null
        ? (pr['base'] as Record<string, unknown>)
        : undefined
    const head =
      typeof pr['head'] === 'object' && pr['head'] !== null
        ? (pr['head'] as Record<string, unknown>)
        : undefined

    const filesResponse = await this.httpClient.get(
      `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`,
    )
    const files =
      filesResponse.status === 200 && Array.isArray(filesResponse.body)
        ? (filesResponse.body as Array<Record<string, unknown>>).map((f) =>
            String(f['filename'] ?? ''),
          )
        : []

    return {
      number: Number(pr['number'] ?? prNumber),
      title: redactGitHubContent(String(pr['title'] ?? '')),
      state: String(pr['state'] ?? 'unknown'),
      merged: Boolean(pr['merged'] ?? false),
      base: String(base?.['ref'] ?? 'main'),
      head: String(head?.['ref'] ?? 'unknown'),
      changedFiles: files,
      additions: Number(pr['additions'] ?? 0),
      deletions: Number(pr['deletions'] ?? 0),
    }
  }

  async getWorkflowEvidence(owner: string, repo: string, runId: number): Promise<GitHubCiEvidence> {
    if (this.httpClient === undefined) {
      throw new Error(
        `No GitHub HTTP client configured for workflow read: ${owner}/${repo} run ${runId}. ` +
          'Provide a GITHUB_TOKEN to enable live reads.',
      )
    }

    const runResponse = await this.httpClient.get(`/repos/${owner}/${repo}/actions/runs/${runId}`)

    if (runResponse.status !== 200) {
      throw new Error(
        `GitHub API returned ${runResponse.status} for workflow run ${owner}/${repo}#${runId}`,
      )
    }

    const run = assertGitHubApiObject(runResponse.body, `workflow run ${owner}/${repo}#${runId}`)

    const jobsResponse = await this.httpClient.get(
      `/repos/${owner}/${repo}/actions/runs/${runId}/jobs`,
    )
    const jobsBody =
      jobsResponse.status === 200
        ? assertGitHubApiObject(jobsResponse.body, `workflow jobs ${owner}/${repo}#${runId}`)
        : {}
    const rawJobs = Array.isArray(jobsBody['jobs'])
      ? (jobsBody['jobs'] as Array<Record<string, unknown>>)
      : []

    return {
      workflow: redactGitHubContent(String(run['name'] ?? 'unknown')),
      conclusion: String(run['conclusion'] ?? 'unknown'),
      jobs: rawJobs.map((job) => ({
        name: redactGitHubContent(String(job['name'] ?? 'unknown')),
        status: String(job['status'] ?? 'unknown'),
        conclusion: String(job['conclusion'] ?? 'unknown'),
        summary: '',
      })),
    }
  }

  async getRepositoryFile(
    owner: string,
    repo: string,
    filePath: string,
    ref: string,
  ): Promise<RepositoryFileResult> {
    if (this.httpClient === undefined) {
      throw new Error(
        `No GitHub HTTP client configured for file read: ${owner}/${repo}/${filePath}@${ref}. ` +
          'Provide a GITHUB_TOKEN to enable live reads.',
      )
    }

    const response = await this.httpClient.get(
      `/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(ref)}`,
    )

    if (response.status !== 200) {
      throw new Error(
        `GitHub API returned ${response.status} for file ${owner}/${repo}/${filePath}@${ref}`,
      )
    }

    const body = assertGitHubApiObject(response.body, `file ${owner}/${repo}/${filePath}@${ref}`)
    const encoding = String(body['encoding'] ?? '')
    const rawContent = String(body['content'] ?? '')

    let content: string
    if (encoding === 'base64') {
      content = Buffer.from(rawContent.replace(/\n/g, ''), 'base64').toString('utf8')
    } else {
      content = rawContent
    }

    return {
      path: filePath,
      ref,
      content: redactGitHubContent(content),
    }
  }
}
