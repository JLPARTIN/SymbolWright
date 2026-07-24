import { describe, expect, it, vi } from 'vitest'

import type {
  GitHubHttpClient,
  GitHubHttpResponse,
} from '../runtime/live-read/github-http-client.js'
import { GitHubOperationsAdapter } from './github-operations-adapter.js'
import { createGitHubOperationsPolicy } from './github-operations-policy.js'

function createMockHttpClient(responses: Map<string, GitHubHttpResponse>): GitHubHttpClient {
  return {
    get: vi.fn().mockImplementation(async (path: string) => {
      return responses.get(`GET ${path}`) ?? { status: 404, body: { message: 'Not Found' } }
    }),
    post: vi.fn().mockImplementation(async (path: string) => {
      return responses.get(`POST ${path}`) ?? { status: 404, body: { message: 'Not Found' } }
    }),
  }
}

describe('GitHubOperationsAdapter', () => {
  describe('reads', () => {
    it('fetches and maps real repository metadata', async () => {
      const http = createMockHttpClient(
        new Map([
          [
            'GET /repos/JLPARTIN/CodeMind',
            {
              status: 200,
              body: {
                full_name: 'JLPARTIN/CodeMind',
                default_branch: 'main',
                fork: false,
                private: false,
                archived: false,
                html_url: 'https://github.com/JLPARTIN/CodeMind',
              },
            },
          ],
        ]),
      )
      const adapter = new GitHubOperationsAdapter({
        httpClient: http,
        policy: createGitHubOperationsPolicy(),
      })
      const result = await adapter.getRepositoryMetadata('JLPARTIN', 'CodeMind')
      expect(result).toEqual({
        status: 'ok',
        data: {
          fullName: 'JLPARTIN/CodeMind',
          defaultBranch: 'main',
          isFork: false,
          isPrivate: false,
          archived: false,
          htmlUrl: 'https://github.com/JLPARTIN/CodeMind',
        },
      })
    })

    it('derives default branch from repository metadata', async () => {
      const http = createMockHttpClient(
        new Map([
          ['GET /repos/JLPARTIN/CodeMind', { status: 200, body: { default_branch: 'develop' } }],
        ]),
      )
      const adapter = new GitHubOperationsAdapter({
        httpClient: http,
        policy: createGitHubOperationsPolicy(),
      })
      const result = await adapter.getDefaultBranch('JLPARTIN', 'CodeMind')
      expect(result).toEqual({ status: 'ok', data: 'develop' })
    })

    it('reports a real HTTP failure honestly instead of a fake success', async () => {
      const http = createMockHttpClient(new Map())
      const adapter = new GitHubOperationsAdapter({
        httpClient: http,
        policy: createGitHubOperationsPolicy(),
      })
      const result = await adapter.getRepositoryMetadata('nobody', 'nothing')
      expect(result.status).toBe('error')
      expect(result.reason).toContain('404')
    })

    it('propagates a getRepositoryMetadata failure through getDefaultBranch instead of a fake branch name', async () => {
      const http = createMockHttpClient(new Map())
      const adapter = new GitHubOperationsAdapter({
        httpClient: http,
        policy: createGitHubOperationsPolicy(),
      })
      const result = await adapter.getDefaultBranch('nobody', 'nothing')
      expect(result.status).toBe('error')
      expect(result.data).toBeUndefined()
    })

    it('reports a thrown getRepositoryMetadata failure honestly instead of an uncaught exception', async () => {
      const http: GitHubHttpClient = {
        get: vi.fn().mockRejectedValue(new Error('connection reset')),
        post: vi.fn(),
      }
      const adapter = new GitHubOperationsAdapter({
        httpClient: http,
        policy: createGitHubOperationsPolicy(),
      })
      const result = await adapter.getRepositoryMetadata('o', 'r')
      expect(result.status).toBe('error')
      expect(result.reason).toBe('connection reset')
    })

    it('reports unavailable when no credentials are configured, without attempting a call', async () => {
      const adapter = new GitHubOperationsAdapter({ policy: createGitHubOperationsPolicy() })
      const result = await adapter.getRepositoryMetadata('JLPARTIN', 'CodeMind')
      expect(result.status).toBe('unavailable')
    })

    it('maps check runs, filtering pull requests out of the issues endpoint', async () => {
      const http = createMockHttpClient(
        new Map([
          [
            'GET /repos/o/r/issues?state=open',
            {
              status: 200,
              body: [
                { number: 1, title: 'Real issue', state: 'open', html_url: 'https://x/1' },
                {
                  number: 2,
                  title: 'A PR, not an issue',
                  state: 'open',
                  html_url: 'https://x/2',
                  pull_request: {},
                },
              ],
            },
          ],
        ]),
      )
      const adapter = new GitHubOperationsAdapter({
        httpClient: http,
        policy: createGitHubOperationsPolicy(),
      })
      const result = await adapter.getIssues('o', 'r')
      expect(result.status).toBe('ok')
      expect(result.data).toEqual([
        { number: 1, title: 'Real issue', state: 'open', htmlUrl: 'https://x/1' },
      ])
    })

    it('maps workflow runs', async () => {
      const http = createMockHttpClient(
        new Map([
          [
            'GET /repos/o/r/actions/runs',
            {
              status: 200,
              body: {
                workflow_runs: [
                  {
                    id: 42,
                    name: 'CI',
                    status: 'completed',
                    conclusion: 'success',
                    head_branch: 'main',
                    html_url: 'https://x/run/42',
                  },
                ],
              },
            },
          ],
        ]),
      )
      const adapter = new GitHubOperationsAdapter({
        httpClient: http,
        policy: createGitHubOperationsPolicy(),
      })
      const result = await adapter.getWorkflowRuns('o', 'r')
      expect(result).toEqual({
        status: 'ok',
        data: [
          {
            id: 42,
            name: 'CI',
            status: 'completed',
            conclusion: 'success',
            headBranch: 'main',
            htmlUrl: 'https://x/run/42',
          },
        ],
      })
    })

    it('maps pull requests including head/base refs', async () => {
      const http = createMockHttpClient(
        new Map([
          [
            'GET /repos/o/r/pulls?state=open',
            {
              status: 200,
              body: [
                {
                  number: 7,
                  title: 'Fix bug',
                  state: 'open',
                  html_url: 'https://x/pull/7',
                  head: { ref: 'fix-branch' },
                  base: { ref: 'main' },
                },
              ],
            },
          ],
        ]),
      )
      const adapter = new GitHubOperationsAdapter({
        httpClient: http,
        policy: createGitHubOperationsPolicy(),
      })
      const result = await adapter.getPullRequests('o', 'r')
      expect(result.data).toEqual([
        {
          number: 7,
          title: 'Fix bug',
          state: 'open',
          htmlUrl: 'https://x/pull/7',
          headRef: 'fix-branch',
          baseRef: 'main',
        },
      ])
    })

    it('reports unavailable for every read method when no credentials are configured', async () => {
      const adapter = new GitHubOperationsAdapter({ policy: createGitHubOperationsPolicy() })
      expect((await adapter.getPullRequestChecks('o', 'r', 'main')).status).toBe('unavailable')
      expect((await adapter.getWorkflowRuns('o', 'r')).status).toBe('unavailable')
      expect((await adapter.getIssues('o', 'r')).status).toBe('unavailable')
      expect((await adapter.getPullRequests('o', 'r')).status).toBe('unavailable')
    })

    it('reports a real non-200 HTTP status honestly for every read method instead of a fake success', async () => {
      const http = createMockHttpClient(new Map())
      const adapter = new GitHubOperationsAdapter({
        httpClient: http,
        policy: createGitHubOperationsPolicy(),
      })
      expect((await adapter.getPullRequestChecks('o', 'r', 'main')).status).toBe('error')
      expect((await adapter.getWorkflowRuns('o', 'r')).status).toBe('error')
      expect((await adapter.getIssues('o', 'r')).status).toBe('error')
      expect((await adapter.getPullRequests('o', 'r')).status).toBe('error')
    })

    it('reports thrown network errors honestly for getIssues and getPullRequests', async () => {
      const http: GitHubHttpClient = {
        get: vi.fn().mockRejectedValue(new Error('ECONNRESET')),
        post: vi.fn(),
      }
      const adapter = new GitHubOperationsAdapter({
        httpClient: http,
        policy: createGitHubOperationsPolicy(),
      })
      expect((await adapter.getIssues('o', 'r')).status).toBe('error')
      expect((await adapter.getPullRequests('o', 'r')).status).toBe('error')
    })

    it('reports a thrown network error honestly instead of an uncaught exception', async () => {
      const http: GitHubHttpClient = {
        get: vi.fn().mockRejectedValue(new Error('socket hang up')),
        post: vi.fn(),
      }
      const adapter = new GitHubOperationsAdapter({
        httpClient: http,
        policy: createGitHubOperationsPolicy(),
      })
      const result = await adapter.getWorkflowRuns('o', 'r')
      expect(result.status).toBe('error')
      expect(result.reason).toBe('socket hang up')
    })

    it('defaults missing optional fields on check runs instead of surfacing undefined', async () => {
      const http = createMockHttpClient(
        new Map([
          [
            'GET /repos/o/r/commits/main/check-runs',
            { status: 200, body: { check_runs: [{ conclusion: null }] } },
          ],
        ]),
      )
      const adapter = new GitHubOperationsAdapter({
        httpClient: http,
        policy: createGitHubOperationsPolicy(),
      })
      const result = await adapter.getPullRequestChecks('o', 'r', 'main')
      expect(result.data).toEqual([{ name: 'unknown', status: 'unknown', conclusion: null }])
    })

    it('defaults missing optional fields on issues instead of surfacing undefined', async () => {
      const http = createMockHttpClient(
        new Map([['GET /repos/o/r/issues?state=open', { status: 200, body: [{}] }]]),
      )
      const adapter = new GitHubOperationsAdapter({
        httpClient: http,
        policy: createGitHubOperationsPolicy(),
      })
      const result = await adapter.getIssues('o', 'r')
      expect(result.data).toEqual([{ number: 0, title: '', state: 'open', htmlUrl: '' }])
    })

    it('defaults missing head/base refs on pull requests instead of throwing on undefined', async () => {
      const http = createMockHttpClient(
        new Map([['GET /repos/o/r/pulls?state=open', { status: 200, body: [{}] }]]),
      )
      const adapter = new GitHubOperationsAdapter({
        httpClient: http,
        policy: createGitHubOperationsPolicy(),
      })
      const result = await adapter.getPullRequests('o', 'r')
      expect(result.data).toEqual([
        { number: 0, title: '', state: 'open', htmlUrl: '', headRef: '', baseRef: '' },
      ])
    })

    it('defaults repository metadata fields that GitHub omits', async () => {
      const http = createMockHttpClient(new Map([['GET /repos/o/r', { status: 200, body: {} }]]))
      const adapter = new GitHubOperationsAdapter({
        httpClient: http,
        policy: createGitHubOperationsPolicy(),
      })
      const result = await adapter.getRepositoryMetadata('o', 'r')
      expect(result).toEqual({
        status: 'ok',
        data: {
          fullName: 'o/r',
          defaultBranch: 'main',
          isFork: false,
          isPrivate: false,
          archived: false,
          htmlUrl: '',
        },
      })
    })
  })

  describe('writes are blocked by default', () => {
    it('blocks createBranch by default with evidence naming the policy', async () => {
      const adapter = new GitHubOperationsAdapter({ policy: createGitHubOperationsPolicy() })
      const result = await adapter.createBranch({
        repository: 'o/r',
        baseBranch: 'main',
        headBranch: 'feature',
      })
      expect(result.status).toBe('blocked')
      expect(result.reason).toContain('push_branch')
    })

    it('blocks pushBranch by default', async () => {
      const adapter = new GitHubOperationsAdapter({ policy: createGitHubOperationsPolicy() })
      const result = await adapter.pushBranch({
        repository: 'o/r',
        branch: 'feature',
        files: [{ path: 'a.txt', content: 'hi' }],
        message: 'commit',
      })
      expect(result.status).toBe('blocked')
    })

    it('blocks openPullRequest by default', async () => {
      const adapter = new GitHubOperationsAdapter({ policy: createGitHubOperationsPolicy() })
      const result = await adapter.openPullRequest({
        repository: 'o/r',
        baseBranch: 'main',
        headBranch: 'feature',
        title: 't',
        body: 'b',
        draft: true,
      })
      expect(result.status).toBe('blocked')
      expect(result.reason).toContain('open_pull_request')
    })

    it('never calls the HTTP client for a blocked write', async () => {
      const http = createMockHttpClient(new Map())
      const adapter = new GitHubOperationsAdapter({
        httpClient: http,
        policy: createGitHubOperationsPolicy(),
      })
      await adapter.openPullRequest({
        repository: 'o/r',
        baseBranch: 'main',
        headBranch: 'feature',
        title: 't',
        body: 'b',
        draft: true,
      })
      expect(http.post).not.toHaveBeenCalled()
    })
  })

  describe('writes when explicitly enabled', () => {
    it('performs a real createBranch call once push_branch is enabled', async () => {
      const http = createMockHttpClient(
        new Map([
          [
            'GET /repos/o/r/git/ref/heads/main',
            { status: 200, body: { object: { sha: 'sha123' } } },
          ],
          ['POST /repos/o/r/git/refs', { status: 201, body: { ref: 'refs/heads/feature' } }],
        ]),
      )
      const adapter = new GitHubOperationsAdapter({
        httpClient: http,
        policy: createGitHubOperationsPolicy({ enabledOperations: ['push_branch'] }),
      })
      const result = await adapter.createBranch({
        repository: 'o/r',
        baseBranch: 'main',
        headBranch: 'feature',
      })
      expect(result.status).toBe('ok')
      expect(http.post).toHaveBeenCalledWith('/repos/o/r/git/refs', {
        ref: 'refs/heads/feature',
        sha: 'sha123',
      })
    })

    it('reports a real remote failure honestly for an enabled write', async () => {
      const http = createMockHttpClient(new Map())
      const adapter = new GitHubOperationsAdapter({
        httpClient: http,
        policy: createGitHubOperationsPolicy({ enabledOperations: ['open_pull_request'] }),
      })
      const result = await adapter.openPullRequest({
        repository: 'o/r',
        baseBranch: 'main',
        headBranch: 'feature',
        title: 't',
        body: 'b',
        draft: true,
      })
      expect(result.status).toBe('error')
    })

    it('reports a thrown createBranch failure honestly instead of an uncaught exception', async () => {
      const http: GitHubHttpClient = {
        get: vi.fn().mockRejectedValue(new Error('DNS failure')),
        post: vi.fn(),
      }
      const adapter = new GitHubOperationsAdapter({
        httpClient: http,
        policy: createGitHubOperationsPolicy({ enabledOperations: ['push_branch'] }),
      })
      const result = await adapter.createBranch({
        repository: 'o/r',
        baseBranch: 'main',
        headBranch: 'feature',
      })
      expect(result.status).toBe('error')
      expect(result.reason).toBe('DNS failure')
    })

    it('reports unavailable for pushBranch when enabled but no credentials are configured', async () => {
      const adapter = new GitHubOperationsAdapter({
        policy: createGitHubOperationsPolicy({ enabledOperations: ['push_branch'] }),
      })
      const result = await adapter.pushBranch({
        repository: 'o/r',
        branch: 'feature',
        files: [{ path: 'a.txt', content: 'hi' }],
        message: 'commit',
      })
      expect(result.status).toBe('unavailable')
    })

    it('reports a thrown pushBranch failure honestly instead of an uncaught exception', async () => {
      const http: GitHubHttpClient = {
        get: vi.fn().mockRejectedValue(new Error('remote ref not found')),
        post: vi.fn(),
      }
      const adapter = new GitHubOperationsAdapter({
        httpClient: http,
        policy: createGitHubOperationsPolicy({ enabledOperations: ['push_branch'] }),
      })
      const result = await adapter.pushBranch({
        repository: 'o/r',
        branch: 'feature',
        files: [{ path: 'a.txt', content: 'hi' }],
        message: 'commit',
      })
      expect(result.status).toBe('error')
      expect(result.reason).toBe('remote ref not found')
    })

    it('reports unavailable for an enabled write with no credentials configured', async () => {
      const adapter = new GitHubOperationsAdapter({
        policy: createGitHubOperationsPolicy({ enabledOperations: ['open_pull_request'] }),
      })
      const result = await adapter.openPullRequest({
        repository: 'o/r',
        baseBranch: 'main',
        headBranch: 'feature',
        title: 't',
        body: 'b',
        draft: true,
      })
      expect(result.status).toBe('unavailable')
    })
  })
})
