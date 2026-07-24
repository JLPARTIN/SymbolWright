import { DefaultGitHubPrCreationClient } from '../runtime/github-write/default-github-pr-creation-client.js'
import type {
  GitHubPrCreationClient,
  GitHubPrCreationFile,
} from '../runtime/github-write/github-pr-creation.js'
import type { GitHubHttpClient } from '../runtime/live-read/github-http-client.js'
import type {
  GitHubOperationBlockedError,
  GitHubOperationsPolicy,
} from './github-operations-policy.js'

/**
 * Real GitHub read/write operations, gated by GitHubOperationsPolicy.
 *
 * Reads use the same GitHubHttpClient the live-read PR adapters already
 * use. Writes (createBranch/pushBranch/openPullRequest) delegate to the
 * existing, already-real GitHubPrCreationClient (Data API branch/commit/PR
 * creation) rather than reimplementing that HTTP logic — Bundle #2's
 * repository workspace and the `github_create_pr` runtime tool both already
 * depend on that client working correctly.
 *
 * Every method returns a typed outcome instead of throwing: a policy block
 * or a missing token becomes `{ status: 'blocked' | 'unavailable', reason }`
 * evidence, never a fabricated success and never an uncaught exception a
 * caller has to guess how to handle.
 */

export type GitHubOperationOutcomeStatus = 'ok' | 'blocked' | 'unavailable' | 'error'

export interface GitHubOperationOutcome<T> {
  readonly status: GitHubOperationOutcomeStatus
  readonly data?: T
  readonly reason?: string
}

export interface GitHubRepositoryMetadata {
  readonly fullName: string
  readonly defaultBranch: string
  readonly isFork: boolean
  readonly isPrivate: boolean
  readonly archived: boolean
  readonly htmlUrl: string
}

export interface GitHubCheckRunSummary {
  readonly name: string
  readonly status: string
  readonly conclusion: string | null
}

export interface GitHubWorkflowRunSummary {
  readonly id: number
  readonly name: string
  readonly status: string
  readonly conclusion: string | null
  readonly headBranch: string
  readonly htmlUrl: string
}

export interface GitHubIssueSummary {
  readonly number: number
  readonly title: string
  readonly state: string
  readonly htmlUrl: string
}

export interface GitHubPullRequestSummary {
  readonly number: number
  readonly title: string
  readonly state: string
  readonly htmlUrl: string
  readonly headRef: string
  readonly baseRef: string
}

function ok<T>(data: T): GitHubOperationOutcome<T> {
  return { status: 'ok', data }
}

function errorOutcome<T>(reason: string): GitHubOperationOutcome<T> {
  return { status: 'error', reason }
}

function blockedOutcome<T>(error: GitHubOperationBlockedError): GitHubOperationOutcome<T> {
  return { status: 'blocked', reason: error.evaluation.reason }
}

export class GitHubOperationsAdapter {
  private readonly httpClient: GitHubHttpClient | undefined
  private readonly prCreationClient: GitHubPrCreationClient | undefined
  private readonly policy: GitHubOperationsPolicy

  public constructor(options: {
    readonly httpClient?: GitHubHttpClient
    readonly prCreationClient?: GitHubPrCreationClient
    readonly policy: GitHubOperationsPolicy
  }) {
    this.httpClient = options.httpClient
    this.prCreationClient =
      options.prCreationClient ??
      (options.httpClient === undefined
        ? undefined
        : new DefaultGitHubPrCreationClient(options.httpClient))
    this.policy = options.policy
  }

  private unavailable<T>(): GitHubOperationOutcome<T> {
    return {
      status: 'unavailable',
      reason: 'No GitHub credentials are configured for this adapter.',
    }
  }

  public async getRepositoryMetadata(
    owner: string,
    repo: string,
  ): Promise<GitHubOperationOutcome<GitHubRepositoryMetadata>> {
    this.policy.evaluate('read_repo_metadata')
    if (this.httpClient === undefined) return this.unavailable()
    try {
      const response = await this.httpClient.get(`/repos/${owner}/${repo}`)
      if (response.status !== 200) {
        return errorOutcome(`GitHub repository metadata request failed: status ${response.status}`)
      }
      const body = response.body as Record<string, unknown>
      return ok({
        fullName: String(body['full_name'] ?? `${owner}/${repo}`),
        defaultBranch: String(body['default_branch'] ?? 'main'),
        isFork: Boolean(body['fork']),
        isPrivate: Boolean(body['private']),
        archived: Boolean(body['archived']),
        htmlUrl: String(body['html_url'] ?? ''),
      })
    } catch (error) {
      return errorOutcome(error instanceof Error ? error.message : String(error))
    }
  }

  public async getDefaultBranch(
    owner: string,
    repo: string,
  ): Promise<GitHubOperationOutcome<string>> {
    const metadata = await this.getRepositoryMetadata(owner, repo)
    if (metadata.status !== 'ok' || metadata.data === undefined) {
      return {
        status: metadata.status,
        ...(metadata.reason === undefined ? {} : { reason: metadata.reason }),
      }
    }
    return ok(metadata.data.defaultBranch)
  }

  public async createBranch(input: {
    readonly repository: string
    readonly baseBranch: string
    readonly headBranch: string
  }): Promise<GitHubOperationOutcome<{ readonly ref: string }>> {
    try {
      this.policy.assertAllowed('push_branch')
    } catch (error) {
      return blockedOutcome(error as GitHubOperationBlockedError)
    }
    if (this.prCreationClient === undefined) return this.unavailable()
    try {
      await this.prCreationClient.createBranch(input)
      return ok({ ref: `refs/heads/${input.headBranch}` })
    } catch (error) {
      return errorOutcome(error instanceof Error ? error.message : String(error))
    }
  }

  public async pushBranch(input: {
    readonly repository: string
    readonly branch: string
    readonly files: readonly GitHubPrCreationFile[]
    readonly message: string
  }): Promise<GitHubOperationOutcome<{ readonly pushed: true }>> {
    try {
      this.policy.assertAllowed('push_branch')
    } catch (error) {
      return blockedOutcome(error as GitHubOperationBlockedError)
    }
    if (this.prCreationClient === undefined) return this.unavailable()
    try {
      await this.prCreationClient.commitFiles(input)
      return ok({ pushed: true })
    } catch (error) {
      return errorOutcome(error instanceof Error ? error.message : String(error))
    }
  }

  public async openPullRequest(input: {
    readonly repository: string
    readonly baseBranch: string
    readonly headBranch: string
    readonly title: string
    readonly body: string
    readonly draft: boolean
  }): Promise<GitHubOperationOutcome<{ readonly url: string }>> {
    try {
      this.policy.assertAllowed('open_pull_request')
    } catch (error) {
      return blockedOutcome(error as GitHubOperationBlockedError)
    }
    if (this.prCreationClient === undefined) return this.unavailable()
    try {
      const result = await this.prCreationClient.createPullRequest(input)
      return ok(result)
    } catch (error) {
      return errorOutcome(error instanceof Error ? error.message : String(error))
    }
  }

  public async getPullRequestChecks(
    owner: string,
    repo: string,
    ref: string,
  ): Promise<GitHubOperationOutcome<readonly GitHubCheckRunSummary[]>> {
    this.policy.evaluate('read_repo_metadata')
    if (this.httpClient === undefined) return this.unavailable()
    try {
      const response = await this.httpClient.get(
        `/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}/check-runs`,
      )
      if (response.status !== 200) {
        return errorOutcome(`GitHub check-runs request failed: status ${response.status}`)
      }
      const body = response.body as { check_runs?: readonly Record<string, unknown>[] }
      const checkRuns = body.check_runs ?? []
      return ok(
        checkRuns.map((run) => ({
          name: String(run['name'] ?? 'unknown'),
          status: String(run['status'] ?? 'unknown'),
          conclusion: run['conclusion'] === null ? null : String(run['conclusion'] ?? ''),
        })),
      )
    } catch (error) {
      return errorOutcome(error instanceof Error ? error.message : String(error))
    }
  }

  public async getWorkflowRuns(
    owner: string,
    repo: string,
  ): Promise<GitHubOperationOutcome<readonly GitHubWorkflowRunSummary[]>> {
    this.policy.evaluate('read_repo_metadata')
    if (this.httpClient === undefined) return this.unavailable()
    try {
      const response = await this.httpClient.get(`/repos/${owner}/${repo}/actions/runs`)
      if (response.status !== 200) {
        return errorOutcome(`GitHub workflow-runs request failed: status ${response.status}`)
      }
      const body = response.body as { workflow_runs?: readonly Record<string, unknown>[] }
      const runs = body.workflow_runs ?? []
      return ok(
        runs.map((run) => ({
          id: Number(run['id'] ?? 0),
          name: String(run['name'] ?? 'unknown'),
          status: String(run['status'] ?? 'unknown'),
          conclusion: run['conclusion'] === null ? null : String(run['conclusion'] ?? ''),
          headBranch: String(run['head_branch'] ?? ''),
          htmlUrl: String(run['html_url'] ?? ''),
        })),
      )
    } catch (error) {
      return errorOutcome(error instanceof Error ? error.message : String(error))
    }
  }

  public async getIssues(
    owner: string,
    repo: string,
  ): Promise<GitHubOperationOutcome<readonly GitHubIssueSummary[]>> {
    this.policy.evaluate('read_repo_metadata')
    if (this.httpClient === undefined) return this.unavailable()
    try {
      const response = await this.httpClient.get(`/repos/${owner}/${repo}/issues?state=open`)
      if (response.status !== 200) {
        return errorOutcome(`GitHub issues request failed: status ${response.status}`)
      }
      const body = response.body as readonly Record<string, unknown>[]
      return ok(
        body
          .filter((issue) => issue['pull_request'] === undefined)
          .map((issue) => ({
            number: Number(issue['number'] ?? 0),
            title: String(issue['title'] ?? ''),
            state: String(issue['state'] ?? 'open'),
            htmlUrl: String(issue['html_url'] ?? ''),
          })),
      )
    } catch (error) {
      return errorOutcome(error instanceof Error ? error.message : String(error))
    }
  }

  public async getPullRequests(
    owner: string,
    repo: string,
  ): Promise<GitHubOperationOutcome<readonly GitHubPullRequestSummary[]>> {
    this.policy.evaluate('read_repo_metadata')
    if (this.httpClient === undefined) return this.unavailable()
    try {
      const response = await this.httpClient.get(`/repos/${owner}/${repo}/pulls?state=open`)
      if (response.status !== 200) {
        return errorOutcome(`GitHub pull-requests request failed: status ${response.status}`)
      }
      const body = response.body as readonly Record<string, unknown>[]
      return ok(
        body.map((pr) => {
          const head = pr['head'] as Record<string, unknown> | undefined
          const base = pr['base'] as Record<string, unknown> | undefined
          return {
            number: Number(pr['number'] ?? 0),
            title: String(pr['title'] ?? ''),
            state: String(pr['state'] ?? 'open'),
            htmlUrl: String(pr['html_url'] ?? ''),
            headRef: String(head?.['ref'] ?? ''),
            baseRef: String(base?.['ref'] ?? ''),
          }
        }),
      )
    } catch (error) {
      return errorOutcome(error instanceof Error ? error.message : String(error))
    }
  }
}
