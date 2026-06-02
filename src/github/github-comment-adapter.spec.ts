import { describe, expect, it, vi } from 'vitest'

import { GithubCommentAdapter, type GithubCommentClient } from './github-comment-adapter.js'

describe('GithubCommentAdapter', () => {
  it('stays dry-run and does not call the client when disabled', async () => {
    const client: GithubCommentClient = {
      postPullRequestComment: vi.fn().mockResolvedValue(undefined),
    }
    const adapter = new GithubCommentAdapter(client, { enabled: false })

    const result = await adapter.postReviewComment({
      repository: 'owner/repo',
      pullRequestNumber: 1,
      markdownReview: '# Ajna Review',
    })

    expect(client.postPullRequestComment).not.toHaveBeenCalled()
    expect(result).toEqual({
      attempted: true,
      posted: false,
      dryRun: true,
      reason: 'GitHub comment adapter is disabled; no comment was posted.',
    })
  })

  it('calls the client only when explicitly enabled', async () => {
    const client: GithubCommentClient = {
      postPullRequestComment: vi.fn().mockResolvedValue(undefined),
    }
    const adapter = new GithubCommentAdapter(client, { enabled: true })

    const result = await adapter.postReviewComment({
      repository: 'owner/repo',
      pullRequestNumber: 2,
      markdownReview: '# Ajna Review',
    })

    expect(client.postPullRequestComment).toHaveBeenCalledWith({
      repository: 'owner/repo',
      pullRequestNumber: 2,
      body: '# Ajna Review',
    })
    expect(result.posted).toBe(true)
    expect(result.dryRun).toBe(false)
  })
})
