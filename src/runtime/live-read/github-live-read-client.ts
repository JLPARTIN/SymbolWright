import type { GitHubCiEvidence } from '../adapters/github-ci-read-adapter.js'
import type { GitHubPrEvidence } from '../adapters/github-pr-read-adapter.js'

import type { GitHubHttpClient } from './github-http-client.js'
import { redactGitHubContent } from './github-live-read-redaction.js'
import type { RepositoryFileResult, RuntimeLiveReadClient } from './runtime-live-read-client.js'

export class GitHubLiveReadClient implements RuntimeLiveReadClient {
  readonly provider = 'github'
  private readonly httpClient: GitHubHttpClient | undefined

  constructor(httpClient?: GitHubHttpClient) {
    this.httpClient = httpClient
  }

  async getPullRequestEvidence(owner: string, repo: string, prNumber: number): Promise<GitHubPrEvidence> {
    if (this.httpClient === undefined) {
      throw new Error(
        `Live GitHub PR read not yet wired: ${owner}/${repo}#${prNumber}. ` +
        'Inject a GitHubHttpClient to enable live reads.',
      )
    }

    const response = await this.httpClient.get(`/repos/${owner}/${repo}/pulls/${prNumber}`)

    if (response.status !== 200) {
      throw new Error(`GitHub API returned ${response.status} for PR ${owner}/${repo}#${prNumber}`)
    }

    const pr = response.body as Record<string, unknown>
    const base = pr['base'] as Record<string, unknown> | undefined
    const head = pr['head'] as Record<string, unknown> | undefined

    const filesResponse = await this.httpClient.get(`/repos/${owner}/${repo}/pulls/${prNumber}/files`)
    const files = filesResponse.status === 200 && Array.isArray(filesResponse.body)
      ? (filesResponse.body as Array<Record<string, unknown>>).map((f) => String(f['filename'] ?? ''))
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
        `Live GitHub workflow read not yet wired: ${owner}/${repo} run ${runId}. ` +
        'Inject a GitHubHttpClient to enable live reads.',
      )
    }

    const runResponse = await this.httpClient.get(`/repos/${owner}/${repo}/actions/runs/${runId}`)

    if (runResponse.status !== 200) {
      throw new Error(`GitHub API returned ${runResponse.status} for workflow run ${owner}/${repo}#${runId}`)
    }

    const run = runResponse.body as Record<string, unknown>

    const jobsResponse = await this.httpClient.get(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`)
    const jobsBody = jobsResponse.status === 200 ? jobsResponse.body as Record<string, unknown> : {}
    const rawJobs = Array.isArray(jobsBody['jobs']) ? jobsBody['jobs'] as Array<Record<string, unknown>> : []

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

  async getRepositoryFile(owner: string, repo: string, filePath: string, ref: string): Promise<RepositoryFileResult> {
    if (this.httpClient === undefined) {
      throw new Error(
        `Live GitHub file read not yet wired: ${owner}/${repo}/${filePath}@${ref}. ` +
        'Inject a GitHubHttpClient to enable live reads.',
      )
    }

    const response = await this.httpClient.get(
      `/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(ref)}`,
    )

    if (response.status !== 200) {
      throw new Error(`GitHub API returned ${response.status} for file ${owner}/${repo}/${filePath}@${ref}`)
    }

    const body = response.body as Record<string, unknown>
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
