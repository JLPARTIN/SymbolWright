import { describe, expect, it, vi } from 'vitest'

import type { GitHubHttpClient, GitHubHttpResponse } from '../live-read/github-http-client.js'
import { DefaultPrCollaborationClient } from './default-pr-collaboration-client.js'

function createMockHttpClient(responses: Map<string, GitHubHttpResponse>): GitHubHttpClient {
  return {
    get: vi.fn().mockResolvedValue({ status: 200, body: {} }),
    post: vi.fn().mockImplementation(async (path: string) => {
      return responses.get(`POST ${path}`) ?? { status: 404, body: { message: 'Not Found' } }
    }),
  }
}

describe('DefaultPrCollaborationClient', () => {
  describe('addComment', () => {
    it('posts a comment to the correct PR', async () => {
      const responses = new Map<string, GitHubHttpResponse>([
        ['POST /repos/owner/repo/issues/10/comments', { status: 201, body: { id: 1 } }],
      ])
      const http = createMockHttpClient(responses)
      const client = new DefaultPrCollaborationClient(http)

      await client.addComment({
        repository: 'owner/repo',
        prNumber: 10,
        body: 'LGTM!',
      })

      expect(http.post).toHaveBeenCalledWith('/repos/owner/repo/issues/10/comments', {
        body: 'LGTM!',
      })
    })

    it('throws when comment post fails', async () => {
      const responses = new Map<string, GitHubHttpResponse>([
        [
          'POST /repos/owner/repo/issues/10/comments',
          { status: 403, body: { message: 'Forbidden' } },
        ],
      ])
      const http = createMockHttpClient(responses)
      const client = new DefaultPrCollaborationClient(http)

      await expect(
        client.addComment({ repository: 'owner/repo', prNumber: 10, body: 'hi' }),
      ).rejects.toThrow('Failed to add comment')
    })
  })

  describe('addLabel', () => {
    it('applies a label to the correct PR', async () => {
      const responses = new Map<string, GitHubHttpResponse>([
        [
          'POST /repos/owner/repo/issues/7/labels',
          { status: 200, body: [{ name: 'enhancement' }] },
        ],
      ])
      const http = createMockHttpClient(responses)
      const client = new DefaultPrCollaborationClient(http)

      await client.addLabel({
        repository: 'owner/repo',
        prNumber: 7,
        label: 'enhancement',
      })

      expect(http.post).toHaveBeenCalledWith('/repos/owner/repo/issues/7/labels', {
        labels: ['enhancement'],
      })
    })

    it('throws when label application fails', async () => {
      const responses = new Map<string, GitHubHttpResponse>([
        [
          'POST /repos/owner/repo/issues/7/labels',
          { status: 422, body: { message: 'Validation Failed' } },
        ],
      ])
      const http = createMockHttpClient(responses)
      const client = new DefaultPrCollaborationClient(http)

      await expect(
        client.addLabel({ repository: 'owner/repo', prNumber: 7, label: 'bug' }),
      ).rejects.toThrow('Failed to add label')
    })
  })

  it('throws on invalid repository format', async () => {
    const http = createMockHttpClient(new Map())
    const client = new DefaultPrCollaborationClient(http)

    await expect(
      client.addComment({ repository: 'noslash', prNumber: 1, body: 'test' }),
    ).rejects.toThrow('Invalid repository format')
  })
})
