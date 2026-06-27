import { describe, expect, it } from 'vitest'

import type { GitHubHttpClient, GitHubHttpResponse } from './github-http-client.js'
import { GitHubLiveReadClient } from './github-live-read-client.js'

class MockGitHubHttpClient implements GitHubHttpClient {
  private readonly responses: Map<string, GitHubHttpResponse> = new Map()

  addResponse(path: string, response: GitHubHttpResponse): void {
    this.responses.set(path, response)
  }

  async get(path: string): Promise<GitHubHttpResponse> {
    const cleanPath = path.split('?')[0] ?? path
    const response = this.responses.get(path) ?? this.responses.get(cleanPath)
    if (response === undefined) {
      return { status: 404, body: { message: 'Not Found' } }
    }
    return response
  }

  async post(_path: string, _body: unknown): Promise<GitHubHttpResponse> {
    return { status: 404, body: { message: 'Not Found' } }
  }
}

describe('GitHubLiveReadClient with mocked HTTP', () => {
  describe('getPullRequestEvidence', () => {
    it('reads PR metadata and changed files', async () => {
      const http = new MockGitHubHttpClient()
      http.addResponse('/repos/owner/repo/pulls/42', {
        status: 200,
        body: {
          number: 42,
          title: 'Add feature X',
          state: 'open',
          merged: false,
          additions: 100,
          deletions: 10,
          base: { ref: 'main' },
          head: { ref: 'feat/x' },
        },
      })
      http.addResponse('/repos/owner/repo/pulls/42/files', {
        status: 200,
        body: [
          { filename: 'src/feature.ts' },
          { filename: 'src/feature.spec.ts' },
        ],
      })

      const client = new GitHubLiveReadClient(http)
      const evidence = await client.getPullRequestEvidence('owner', 'repo', 42)

      expect(evidence.number).toBe(42)
      expect(evidence.title).toBe('Add feature X')
      expect(evidence.state).toBe('open')
      expect(evidence.merged).toBe(false)
      expect(evidence.base).toBe('main')
      expect(evidence.head).toBe('feat/x')
      expect(evidence.changedFiles).toEqual(['src/feature.ts', 'src/feature.spec.ts'])
      expect(evidence.additions).toBe(100)
      expect(evidence.deletions).toBe(10)
    })

    it('handles missing files endpoint gracefully', async () => {
      const http = new MockGitHubHttpClient()
      http.addResponse('/repos/owner/repo/pulls/1', {
        status: 200,
        body: {
          number: 1,
          title: 'Fix bug',
          state: 'closed',
          merged: true,
          additions: 5,
          deletions: 2,
          base: { ref: 'main' },
          head: { ref: 'fix/bug' },
        },
      })

      const client = new GitHubLiveReadClient(http)
      const evidence = await client.getPullRequestEvidence('owner', 'repo', 1)

      expect(evidence.changedFiles).toEqual([])
      expect(evidence.merged).toBe(true)
    })

    it('throws on non-200 status for PR', async () => {
      const http = new MockGitHubHttpClient()
      http.addResponse('/repos/owner/repo/pulls/999', {
        status: 404,
        body: { message: 'Not Found' },
      })

      const client = new GitHubLiveReadClient(http)
      await expect(client.getPullRequestEvidence('owner', 'repo', 999)).rejects.toThrow(
        'GitHub API returned 404',
      )
    })

    it('redacts tokens in PR title', async () => {
      const http = new MockGitHubHttpClient()
      http.addResponse('/repos/owner/repo/pulls/10', {
        status: 200,
        body: {
          number: 10,
          title: 'Update token ghp_abcdefghijklmnopqrstuvwxyz1234567890',
          state: 'open',
          merged: false,
          additions: 1,
          deletions: 0,
          base: { ref: 'main' },
          head: { ref: 'fix/token' },
        },
      })
      http.addResponse('/repos/owner/repo/pulls/10/files', {
        status: 200,
        body: [],
      })

      const client = new GitHubLiveReadClient(http)
      const evidence = await client.getPullRequestEvidence('owner', 'repo', 10)

      expect(evidence.title).not.toContain('ghp_')
      expect(evidence.title).toContain('[REDACTED]')
    })
  })

  describe('getWorkflowEvidence', () => {
    it('reads workflow run and jobs', async () => {
      const http = new MockGitHubHttpClient()
      http.addResponse('/repos/owner/repo/actions/runs/5001', {
        status: 200,
        body: {
          name: 'CI',
          conclusion: 'success',
        },
      })
      http.addResponse('/repos/owner/repo/actions/runs/5001/jobs', {
        status: 200,
        body: {
          jobs: [
            { name: 'build', status: 'completed', conclusion: 'success' },
            { name: 'test', status: 'completed', conclusion: 'success' },
          ],
        },
      })

      const client = new GitHubLiveReadClient(http)
      const evidence = await client.getWorkflowEvidence('owner', 'repo', 5001)

      expect(evidence.workflow).toBe('CI')
      expect(evidence.conclusion).toBe('success')
      expect(evidence.jobs).toHaveLength(2)
      expect(evidence.jobs[0]!.name).toBe('build')
      expect(evidence.jobs[1]!.name).toBe('test')
    })

    it('handles missing jobs endpoint', async () => {
      const http = new MockGitHubHttpClient()
      http.addResponse('/repos/owner/repo/actions/runs/100', {
        status: 200,
        body: { name: 'Deploy', conclusion: 'failure' },
      })

      const client = new GitHubLiveReadClient(http)
      const evidence = await client.getWorkflowEvidence('owner', 'repo', 100)

      expect(evidence.workflow).toBe('Deploy')
      expect(evidence.conclusion).toBe('failure')
      expect(evidence.jobs).toEqual([])
    })

    it('throws on non-200 status for workflow run', async () => {
      const http = new MockGitHubHttpClient()

      const client = new GitHubLiveReadClient(http)
      await expect(client.getWorkflowEvidence('owner', 'repo', 999)).rejects.toThrow(
        'GitHub API returned 404',
      )
    })

    it('redacts tokens in workflow name', async () => {
      const http = new MockGitHubHttpClient()
      http.addResponse('/repos/owner/repo/actions/runs/200', {
        status: 200,
        body: {
          name: 'CI with ghp_abcdefghijklmnopqrstuvwxyz1234567890',
          conclusion: 'success',
        },
      })
      http.addResponse('/repos/owner/repo/actions/runs/200/jobs', {
        status: 200,
        body: { jobs: [] },
      })

      const client = new GitHubLiveReadClient(http)
      const evidence = await client.getWorkflowEvidence('owner', 'repo', 200)

      expect(evidence.workflow).not.toContain('ghp_')
      expect(evidence.workflow).toContain('[REDACTED]')
    })
  })

  describe('getRepositoryFile', () => {
    it('reads base64-encoded file content', async () => {
      const http = new MockGitHubHttpClient()
      const encoded = Buffer.from('# Hello World').toString('base64')
      http.addResponse('/repos/owner/repo/contents/README.md', {
        status: 200,
        body: {
          content: encoded,
          encoding: 'base64',
        },
      })

      const client = new GitHubLiveReadClient(http)
      const result = await client.getRepositoryFile('owner', 'repo', 'README.md', 'main')

      expect(result.path).toBe('README.md')
      expect(result.ref).toBe('main')
      expect(result.content).toBe('# Hello World')
    })

    it('reads raw content when not base64', async () => {
      const http = new MockGitHubHttpClient()
      http.addResponse('/repos/owner/repo/contents/file.txt', {
        status: 200,
        body: {
          content: 'plain text content',
          encoding: 'utf-8',
        },
      })

      const client = new GitHubLiveReadClient(http)
      const result = await client.getRepositoryFile('owner', 'repo', 'file.txt', 'dev')

      expect(result.content).toBe('plain text content')
    })

    it('throws on non-200 status for file', async () => {
      const http = new MockGitHubHttpClient()

      const client = new GitHubLiveReadClient(http)
      await expect(
        client.getRepositoryFile('owner', 'repo', 'missing.ts', 'main'),
      ).rejects.toThrow('GitHub API returned 404')
    })

    it('redacts secrets in file content', async () => {
      const http = new MockGitHubHttpClient()
      const content = 'API_KEY=ghp_abcdefghijklmnopqrstuvwxyz1234567890'
      const encoded = Buffer.from(content).toString('base64')
      http.addResponse('/repos/owner/repo/contents/config.ts', {
        status: 200,
        body: { content: encoded, encoding: 'base64' },
      })

      const client = new GitHubLiveReadClient(http)
      const result = await client.getRepositoryFile('owner', 'repo', 'config.ts', 'main')

      expect(result.content).not.toContain('ghp_')
      expect(result.content).toContain('[REDACTED]')
    })
  })

  describe('without HTTP client (backward compatibility)', () => {
    it('throws not-yet-wired for PR read', async () => {
      const client = new GitHubLiveReadClient()
      await expect(client.getPullRequestEvidence('o', 'r', 1)).rejects.toThrow(
        'not yet wired',
      )
    })

    it('throws not-yet-wired for workflow read', async () => {
      const client = new GitHubLiveReadClient()
      await expect(client.getWorkflowEvidence('o', 'r', 1)).rejects.toThrow(
        'not yet wired',
      )
    })

    it('throws not-yet-wired for file read', async () => {
      const client = new GitHubLiveReadClient()
      await expect(client.getRepositoryFile('o', 'r', 'f', 'main')).rejects.toThrow(
        'not yet wired',
      )
    })
  })
})
