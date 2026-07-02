import { describe, expect, it } from 'vitest'

import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import { FakeGitHubWriteExecutorClient } from './fake-github-write-executor-client.js'
import {
  executeGitHubWrite,
  renderGitHubWriteExecutorResult,
  type GitHubWriteExecutorRequest,
} from './github-write-executor.js'

const policy: RuntimePolicySnapshot = {
  mode: 'APPROVED_EXECUTION',
  allowNetwork: false,
  allowReadOnlyNetwork: true,
  allowShell: false,
  allowWrites: false,
  allowGitHubWrites: true,
  protectedPaths: [],
  noisyDirs: [],
}

const blockedPolicy: RuntimePolicySnapshot = {
  ...policy,
  allowGitHubWrites: false,
}

const approval: RuntimeApproval = {
  ticketId: 'GH-WRITE-001',
  approvedBy: 'operator',
  scopes: ['github:write'],
}

function makeRequest(
  overrides: Partial<GitHubWriteExecutorRequest> = {},
): GitHubWriteExecutorRequest {
  return {
    action: 'post_comment',
    repository: 'owner/repo',
    targetRef: '42',
    content: 'LGTM — tests pass.',
    reason: 'Notify reviewer of CI results',
    dryRun: false,
    ...overrides,
  }
}

describe('executeGitHubWrite', () => {
  it('executes post_comment in live mode', async () => {
    const client = new FakeGitHubWriteExecutorClient()
    const result = await executeGitHubWrite(makeRequest(), policy, undefined, client, 'live')

    expect(result.outcome).toBe('EXECUTED')
    expect(result.action).toBe('post_comment')
    expect(result.executionMode).toBe('live')
    expect(result.operationSummary).toContain('Posted comment')
    expect(result.resourceUrl).toContain('comment-fake')
    expect(result.blockReasons).toHaveLength(0)
    expect(client.operations).toHaveLength(1)
    expect(client.operations[0]?.action).toBe('post_comment')
  })

  it('executes create_draft_pr in live mode', async () => {
    const client = new FakeGitHubWriteExecutorClient()
    const result = await executeGitHubWrite(
      makeRequest({ action: 'create_draft_pr', targetRef: 'main', content: 'PR body' }),
      policy,
      undefined,
      client,
      'live',
    )

    expect(result.outcome).toBe('EXECUTED')
    expect(result.action).toBe('create_draft_pr')
    expect(result.executionMode).toBe('live')
    expect(result.resourceUrl).toContain('pull/fake-1')
    expect(client.operations).toHaveLength(1)
  })

  it('executes apply_label in live mode', async () => {
    const client = new FakeGitHubWriteExecutorClient()
    const result = await executeGitHubWrite(
      makeRequest({ action: 'apply_label', content: 'ready-for-review' }),
      policy,
      undefined,
      client,
      'live',
    )

    expect(result.outcome).toBe('EXECUTED')
    expect(result.action).toBe('apply_label')
    expect(result.executionMode).toBe('live')
    expect(result.operationSummary).toContain('ready-for-review')
    expect(result.resourceUrl).toBeNull()
  })

  it('blocks non-dry-run execution in fixture mode', async () => {
    const client = new FakeGitHubWriteExecutorClient()
    const result = await executeGitHubWrite(makeRequest(), policy, approval, client, 'fixture')

    expect(result.outcome).toBe('BLOCKED')
    expect(result.executionMode).toBe('fixture')
    expect(result.blockReasons.some((r) => r.includes('blocked in fixture mode'))).toBe(true)
    expect(client.operations).toHaveLength(0)
  })

  it('defaults executionMode to fixture', async () => {
    const client = new FakeGitHubWriteExecutorClient()
    const result = await executeGitHubWrite(makeRequest(), policy, approval, client)

    expect(result.outcome).toBe('BLOCKED')
    expect(result.executionMode).toBe('fixture')
  })

  it('dry-runs without executing client', async () => {
    const client = new FakeGitHubWriteExecutorClient()
    const result = await executeGitHubWrite(
      makeRequest({ dryRun: true }),
      policy,
      undefined,
      client,
    )

    expect(result.outcome).toBe('DRY_RUN')
    expect(result.operationSummary).toContain('Would post comment')
    expect(result.resourceUrl).toBeNull()
    expect(client.operations).toHaveLength(0)
    expect(result.blockReasons).toHaveLength(0)
  })

  it('blocks when GitHub writes disabled by policy', async () => {
    const client = new FakeGitHubWriteExecutorClient()
    const result = await executeGitHubWrite(makeRequest(), blockedPolicy, undefined, client)

    expect(result.outcome).toBe('BLOCKED')
    expect(result.blockReasons.some((r) => r.includes('disabled by runtime policy'))).toBe(true)
    expect(client.operations).toHaveLength(0)
  })

  it('blocks on empty repository', async () => {
    const client = new FakeGitHubWriteExecutorClient()
    const result = await executeGitHubWrite(
      makeRequest({ repository: '' }),
      policy,
      approval,
      client,
    )

    expect(result.outcome).toBe('BLOCKED')
    expect(result.blockReasons.some((r) => r.includes('repository'))).toBe(true)
  })

  it('blocks on empty target ref', async () => {
    const client = new FakeGitHubWriteExecutorClient()
    const result = await executeGitHubWrite(
      makeRequest({ targetRef: '' }),
      policy,
      approval,
      client,
    )

    expect(result.outcome).toBe('BLOCKED')
    expect(result.blockReasons.some((r) => r.includes('reference'))).toBe(true)
  })

  it('blocks on empty content', async () => {
    const client = new FakeGitHubWriteExecutorClient()
    const result = await executeGitHubWrite(makeRequest({ content: '' }), policy, approval, client)

    expect(result.outcome).toBe('BLOCKED')
    expect(result.blockReasons.some((r) => r.includes('empty'))).toBe(true)
  })

  it('blocks on empty reason', async () => {
    const client = new FakeGitHubWriteExecutorClient()
    const result = await executeGitHubWrite(makeRequest({ reason: '' }), policy, approval, client)

    expect(result.outcome).toBe('BLOCKED')
    expect(result.blockReasons.some((r) => r.includes('reason'))).toBe(true)
  })

  it('tracks elapsed time', async () => {
    const client = new FakeGitHubWriteExecutorClient()
    const result = await executeGitHubWrite(makeRequest(), policy, undefined, client, 'live')

    expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('provides recommended next action for each outcome', async () => {
    const client = new FakeGitHubWriteExecutorClient()

    const executed = await executeGitHubWrite(makeRequest(), policy, undefined, client, 'live')
    expect(executed.recommendedNextAction).toContain('Verify')

    const dryRun = await executeGitHubWrite(
      makeRequest({ dryRun: true }),
      policy,
      undefined,
      client,
    )
    expect(dryRun.recommendedNextAction).toContain('dry-run')

    const blocked = await executeGitHubWrite(
      makeRequest(),
      blockedPolicy,
      undefined,
      client,
      'live',
    )
    expect(blocked.recommendedNextAction).toContain('block reasons')
  })
})

describe('renderGitHubWriteExecutorResult', () => {
  it('renders executed result with execution mode', async () => {
    const client = new FakeGitHubWriteExecutorClient()
    const result = await executeGitHubWrite(makeRequest(), policy, undefined, client, 'live')
    const output = renderGitHubWriteExecutorResult(result)

    expect(output).toContain('CodeMind GitHub Write Executor')
    expect(output).toContain('Outcome: EXECUTED')
    expect(output).toContain('Execution mode: live')
    expect(output).toContain('Action: post_comment')
    expect(output).toContain('Resource:')
  })

  it('renders dry-run result', async () => {
    const client = new FakeGitHubWriteExecutorClient()
    const result = await executeGitHubWrite(
      makeRequest({ dryRun: true }),
      policy,
      undefined,
      client,
    )
    const output = renderGitHubWriteExecutorResult(result)

    expect(output).toContain('Outcome: DRY_RUN')
    expect(output).toContain('Execution mode: fixture')
    expect(output).toContain('Dry-run only')
    expect(output).toContain('Would post comment')
  })

  it('renders blocked result with reasons', async () => {
    const client = new FakeGitHubWriteExecutorClient()
    const result = await executeGitHubWrite(makeRequest(), blockedPolicy, undefined, client, 'live')
    const output = renderGitHubWriteExecutorResult(result)

    expect(output).toContain('Outcome: BLOCKED')
    expect(output).toContain('Block reasons:')
    expect(output).toContain('disabled by runtime policy')
  })
})
