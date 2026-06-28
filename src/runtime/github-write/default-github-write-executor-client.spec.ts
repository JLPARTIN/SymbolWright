import { describe, expect, it, vi } from 'vitest'

import type { GitHubHttpClient, GitHubHttpResponse } from '../live-read/github-http-client.js'
import { DefaultGitHubWriteExecutorClient } from './default-github-write-executor-client.js'

function createMockHttpClient(responses: Map<string, GitHubHttpResponse>): GitHubHttpClient {
  return {
    get: vi.fn().mockResolvedValue({ status: 200, body: {} }),
    post: vi.fn().mockImplementation(async (path: string) => {
      return responses.get(`POST ${path}`) ?? { status: 404, body: { message: 'Not Found' } }
    }),
  }
}

describe('DefaultGitHubWriteExecutorClient', () => {
  describe('create_draft_pr', () => {
    it('creates a draft PR and returns summary and URL', async () => {
      const responses = new Map<string, GitHubHttpResponse>([
        [
          'POST /repos/owner/repo/pulls',
          {
            status: 201,
            body: { html_url: 'https://github.com/owner/repo/pull/7' },
          },
        ],
      ])
      const http = createMockHttpClient(responses)
      const client = new DefaultGitHubWriteExecutorClient(http)

      const result = await client.execute({
        action: 'create_draft_pr',
        repository: 'owner/repo',
        targetRef: 'feature-branch',
        content: 'PR Title\nPR body description',
      })

      expect(result.operationSummary).toContain('Created draft PR')
      expect(result.resourceUrl).toBe('https://github.com/owner/repo/pull/7')
      expect(http.post).toHaveBeenCalledWith('/repos/owner/repo/pulls', {
        title: 'PR Title',
        body: 'PR body description',
        head: 'feature-branch',
        base: 'main',
        draft: true,
      })
    })

    it('throws when PR creation fails', async () => {
      const responses = new Map<string, GitHubHttpResponse>([
        ['POST /repos/owner/repo/pulls', { status: 422, body: { message: 'Validation Failed' } }],
      ])
      const http = createMockHttpClient(responses)
      const client = new DefaultGitHubWriteExecutorClient(http)

      await expect(
        client.execute({
          action: 'create_draft_pr',
          repository: 'owner/repo',
          targetRef: 'feature',
          content: 'Title',
        }),
      ).rejects.toThrow('Failed to create draft PR')
    })
  })

  describe('post_comment', () => {
    it('posts a comment and returns summary and URL', async () => {
      const responses = new Map<string, GitHubHttpResponse>([
        [
          'POST /repos/owner/repo/issues/5/comments',
          {
            status: 201,
            body: { html_url: 'https://github.com/owner/repo/pull/5#issuecomment-123' },
          },
        ],
      ])
      const http = createMockHttpClient(responses)
      const client = new DefaultGitHubWriteExecutorClient(http)

      const result = await client.execute({
        action: 'post_comment',
        repository: 'owner/repo',
        targetRef: '5',
        content: 'Great work!',
      })

      expect(result.operationSummary).toContain('Posted comment')
      expect(result.resourceUrl).toContain('issuecomment')
      expect(http.post).toHaveBeenCalledWith('/repos/owner/repo/issues/5/comments', {
        body: 'Great work!',
      })
    })

    it('throws when comment post fails', async () => {
      const responses = new Map<string, GitHubHttpResponse>([
        [
          'POST /repos/owner/repo/issues/5/comments',
          { status: 403, body: { message: 'Forbidden' } },
        ],
      ])
      const http = createMockHttpClient(responses)
      const client = new DefaultGitHubWriteExecutorClient(http)

      await expect(
        client.execute({
          action: 'post_comment',
          repository: 'owner/repo',
          targetRef: '5',
          content: 'hello',
        }),
      ).rejects.toThrow('Failed to post comment')
    })
  })

  describe('apply_label', () => {
    it('applies a label and returns summary', async () => {
      const responses = new Map<string, GitHubHttpResponse>([
        [
          'POST /repos/owner/repo/issues/3/labels',
          {
            status: 200,
            body: [{ name: 'bug' }],
          },
        ],
      ])
      const http = createMockHttpClient(responses)
      const client = new DefaultGitHubWriteExecutorClient(http)

      const result = await client.execute({
        action: 'apply_label',
        repository: 'owner/repo',
        targetRef: '3',
        content: 'bug',
      })

      expect(result.operationSummary).toContain('Applied label')
      expect(result.operationSummary).toContain('bug')
      expect(result.resourceUrl).toBeNull()
      expect(http.post).toHaveBeenCalledWith('/repos/owner/repo/issues/3/labels', {
        labels: ['bug'],
      })
    })

    it('throws when label application fails', async () => {
      const responses = new Map<string, GitHubHttpResponse>([
        [
          'POST /repos/owner/repo/issues/3/labels',
          { status: 422, body: { message: 'Validation Failed' } },
        ],
      ])
      const http = createMockHttpClient(responses)
      const client = new DefaultGitHubWriteExecutorClient(http)

      await expect(
        client.execute({
          action: 'apply_label',
          repository: 'owner/repo',
          targetRef: '3',
          content: 'bug',
        }),
      ).rejects.toThrow('Failed to apply label')
    })
  })

  it('throws on invalid repository format', async () => {
    const http = createMockHttpClient(new Map())
    const client = new DefaultGitHubWriteExecutorClient(http)

    await expect(
      client.execute({
        action: 'post_comment',
        repository: 'bad-format',
        targetRef: '1',
        content: 'hello',
      }),
    ).rejects.toThrow('Invalid repository format')
  })
})
