import { describe, expect, it } from 'vitest'

import {
  DEFAULT_ALLOWED_OPERATIONS,
  DEFAULT_BLOCKED_OPERATIONS,
  GITHUB_OPERATIONS,
  GitHubOperationBlockedError,
  createGitHubOperationsPolicy,
  renderGitHubOperationsPolicyReport,
} from './github-operations-policy.js'

describe('GitHubOperationsPolicy', () => {
  it('allows local, workspace-scoped operations by default', () => {
    const policy = createGitHubOperationsPolicy()
    for (const operation of DEFAULT_ALLOWED_OPERATIONS) {
      expect(policy.isAllowed(operation)).toBe(true)
      expect(() => policy.assertAllowed(operation)).not.toThrow()
    }
  })

  it('blocks every remote-mutating operation by default', () => {
    const policy = createGitHubOperationsPolicy()
    expect(DEFAULT_BLOCKED_OPERATIONS).toEqual([
      'push_branch',
      'open_pull_request',
      'comment_on_issue',
      'label_issue',
      'close_issue',
      'rerun_workflow',
      'delete_branch',
    ])
    for (const operation of DEFAULT_BLOCKED_OPERATIONS) {
      expect(policy.isAllowed(operation)).toBe(false)
      expect(() => policy.assertAllowed(operation)).toThrow(GitHubOperationBlockedError)
    }
  })

  it('covers every declared operation across allowed + blocked defaults', () => {
    expect(new Set([...DEFAULT_ALLOWED_OPERATIONS, ...DEFAULT_BLOCKED_OPERATIONS])).toEqual(
      new Set(GITHUB_OPERATIONS),
    )
  })

  it('produces evidence explaining exactly which policy stopped a blocked operation', () => {
    const policy = createGitHubOperationsPolicy()
    const evaluation = policy.evaluate('open_pull_request')
    expect(evaluation.allowed).toBe(false)
    expect(evaluation.defaultAllowed).toBe(false)
    expect(evaluation.reason).toContain('open_pull_request')
    expect(evaluation.reason).toContain('blocked by default')

    try {
      policy.assertAllowed('open_pull_request')
      expect.unreachable('assertAllowed should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(GitHubOperationBlockedError)
      expect((error as GitHubOperationBlockedError).evaluation).toEqual(evaluation)
    }
  })

  it('allows explicitly enabled remote operations, and only those', () => {
    const policy = createGitHubOperationsPolicy({ enabledOperations: ['push_branch'] })
    expect(policy.isAllowed('push_branch')).toBe(true)
    expect(policy.isAllowed('open_pull_request')).toBe(false)
    const pushEvaluation = policy.evaluate('push_branch')
    expect(pushEvaluation.defaultAllowed).toBe(false)
    expect(pushEvaluation.reason).toContain('explicitly enabled')
  })

  it('cannot be widened by re-enabling an already-default-allowed operation', () => {
    const policy = createGitHubOperationsPolicy({ enabledOperations: ['clone_repo'] })
    expect(policy.evaluate('clone_repo').defaultAllowed).toBe(true)
  })

  it('lists only blocked operations via blockedOperations()', () => {
    const policy = createGitHubOperationsPolicy({ enabledOperations: ['open_pull_request'] })
    const blocked = policy.blockedOperations().map((evaluation) => evaluation.operation)
    expect(blocked).not.toContain('open_pull_request')
    expect(blocked).toContain('push_branch')
    expect(blocked).toHaveLength(DEFAULT_BLOCKED_OPERATIONS.length - 1)
  })

  it('renders a human-readable report covering every operation', () => {
    const policy = createGitHubOperationsPolicy()
    const report = renderGitHubOperationsPolicyReport(policy)
    for (const operation of GITHUB_OPERATIONS) {
      expect(report).toContain(operation)
    }
    expect(report).toContain('ALLOWED')
    expect(report).toContain('BLOCKED')
  })
})
