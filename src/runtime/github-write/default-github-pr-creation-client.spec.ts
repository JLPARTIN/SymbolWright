import { describe, expect, it, vi } from 'vitest'

import type { GitHubHttpClient, GitHubHttpResponse } from '../live-read/github-http-client.js'
import { DefaultGitHubPrCreationClient } from './default-github-pr-creation-client.js'

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

describe('DefaultGitHubPrCreationClient', () => {
  describe('createBranch', () => {
    it('resolves base branch SHA and creates a new ref', async () => {
      const responses = new Map<string, GitHubHttpResponse>([
        [
          'GET /repos/owner/repo/git/ref/heads/main',
          { status: 200, body: { object: { sha: 'abc123' } } },
        ],
        ['POST /repos/owner/repo/git/refs', { status: 201, body: { ref: 'refs/heads/feature' } }],
      ])
      const http = createMockHttpClient(responses)
      const client = new DefaultGitHubPrCreationClient(http)

      await client.createBranch({
        repository: 'owner/repo',
        baseBranch: 'main',
        headBranch: 'feature',
      })

      expect(http.get).toHaveBeenCalledWith('/repos/owner/repo/git/ref/heads/main')
      expect(http.post).toHaveBeenCalledWith('/repos/owner/repo/git/refs', {
        ref: 'refs/heads/feature',
        sha: 'abc123',
      })
    })

    it('throws when base branch resolution fails', async () => {
      const responses = new Map<string, GitHubHttpResponse>([
        [
          'GET /repos/owner/repo/git/ref/heads/main',
          { status: 404, body: { message: 'Not Found' } },
        ],
      ])
      const http = createMockHttpClient(responses)
      const client = new DefaultGitHubPrCreationClient(http)

      await expect(
        client.createBranch({
          repository: 'owner/repo',
          baseBranch: 'main',
          headBranch: 'feature',
        }),
      ).rejects.toThrow('Failed to resolve base branch')
    })

    it('throws when branch creation fails', async () => {
      const responses = new Map<string, GitHubHttpResponse>([
        [
          'GET /repos/owner/repo/git/ref/heads/main',
          { status: 200, body: { object: { sha: 'abc123' } } },
        ],
        [
          'POST /repos/owner/repo/git/refs',
          { status: 422, body: { message: 'Reference already exists' } },
        ],
      ])
      const http = createMockHttpClient(responses)
      const client = new DefaultGitHubPrCreationClient(http)

      await expect(
        client.createBranch({
          repository: 'owner/repo',
          baseBranch: 'main',
          headBranch: 'feature',
        }),
      ).rejects.toThrow('Failed to create branch')
    })
  })

  describe('commitFiles', () => {
    it('creates tree, commit, and updates ref', async () => {
      const responses = new Map<string, GitHubHttpResponse>([
        [
          'GET /repos/owner/repo/git/ref/heads/feature',
          { status: 200, body: { object: { sha: 'parent123' } } },
        ],
        ['POST /repos/owner/repo/git/trees', { status: 201, body: { sha: 'tree456' } }],
        ['POST /repos/owner/repo/git/commits', { status: 201, body: { sha: 'commit789' } }],
        ['POST /repos/owner/repo/git/refs/heads/feature', { status: 200, body: {} }],
      ])
      const http = createMockHttpClient(responses)
      const client = new DefaultGitHubPrCreationClient(http)

      await client.commitFiles({
        repository: 'owner/repo',
        branch: 'feature',
        files: [{ path: 'README.md', content: '# Hello' }],
        message: 'Initial commit',
      })

      expect(http.post).toHaveBeenCalledWith('/repos/owner/repo/git/trees', {
        base_tree: 'parent123',
        tree: [{ path: 'README.md', mode: '100644', type: 'blob', content: '# Hello' }],
      })
      expect(http.post).toHaveBeenCalledWith('/repos/owner/repo/git/commits', {
        message: 'Initial commit',
        tree: 'tree456',
        parents: ['parent123'],
      })
    })

    it('throws when branch ref resolution fails', async () => {
      const responses = new Map<string, GitHubHttpResponse>([
        ['GET /repos/owner/repo/git/ref/heads/feature', { status: 404, body: {} }],
      ])
      const http = createMockHttpClient(responses)
      const client = new DefaultGitHubPrCreationClient(http)

      await expect(
        client.commitFiles({
          repository: 'owner/repo',
          branch: 'feature',
          files: [{ path: 'a.txt', content: 'hello' }],
          message: 'commit',
        }),
      ).rejects.toThrow('Failed to resolve branch')
    })

    it('throws when tree creation fails', async () => {
      const responses = new Map<string, GitHubHttpResponse>([
        [
          'GET /repos/owner/repo/git/ref/heads/feature',
          { status: 200, body: { object: { sha: 'abc' } } },
        ],
        ['POST /repos/owner/repo/git/trees', { status: 500, body: {} }],
      ])
      const http = createMockHttpClient(responses)
      const client = new DefaultGitHubPrCreationClient(http)

      await expect(
        client.commitFiles({
          repository: 'owner/repo',
          branch: 'feature',
          files: [{ path: 'a.txt', content: 'hello' }],
          message: 'commit',
        }),
      ).rejects.toThrow('Failed to create tree')
    })
  })

  describe('createPullRequest', () => {
    it('creates a draft PR and returns the URL', async () => {
      const responses = new Map<string, GitHubHttpResponse>([
        [
          'POST /repos/owner/repo/pulls',
          {
            status: 201,
            body: { html_url: 'https://github.com/owner/repo/pull/42' },
          },
        ],
      ])
      const http = createMockHttpClient(responses)
      const client = new DefaultGitHubPrCreationClient(http)

      const result = await client.createPullRequest({
        repository: 'owner/repo',
        baseBranch: 'main',
        headBranch: 'feature',
        title: 'My PR',
        body: 'Description',
        draft: true,
      })

      expect(result.url).toBe('https://github.com/owner/repo/pull/42')
      expect(http.post).toHaveBeenCalledWith('/repos/owner/repo/pulls', {
        title: 'My PR',
        body: 'Description',
        head: 'feature',
        base: 'main',
        draft: true,
      })
    })

    it('throws when PR creation fails', async () => {
      const responses = new Map<string, GitHubHttpResponse>([
        ['POST /repos/owner/repo/pulls', { status: 422, body: { message: 'Validation Failed' } }],
      ])
      const http = createMockHttpClient(responses)
      const client = new DefaultGitHubPrCreationClient(http)

      await expect(
        client.createPullRequest({
          repository: 'owner/repo',
          baseBranch: 'main',
          headBranch: 'feature',
          title: 'PR',
          body: '',
          draft: true,
        }),
      ).rejects.toThrow('Failed to create pull request')
    })
  })

  it('throws on invalid repository format', async () => {
    const http = createMockHttpClient(new Map())
    const client = new DefaultGitHubPrCreationClient(http)

    await expect(
      client.createBranch({ repository: 'invalid', baseBranch: 'main', headBranch: 'feature' }),
    ).rejects.toThrow('Invalid repository format')
  })
})
