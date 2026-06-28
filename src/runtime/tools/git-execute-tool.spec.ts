import { describe, expect, it } from 'vitest'

import { createDefaultRuntimePolicy } from '../policy/runtime-policy.js'
import type { RuntimeApproval, RuntimeToolContext } from '../types.js'

import { executeGitTool } from './git-execute-tool.js'

function makeContext(overrides: Partial<RuntimeToolContext> = {}): RuntimeToolContext {
  return {
    cwd: process.cwd(),
    policy: createDefaultRuntimePolicy(),
    ...overrides,
  }
}

function makeApprovedContext(): RuntimeToolContext {
  const approval: RuntimeApproval = {
    ticketId: 'TEST-001',
    approvedBy: 'test',
    scopes: ['git:write', 'file:write', 'shell:execute'],
  }
  return {
    cwd: process.cwd(),
    policy: {
      ...createDefaultRuntimePolicy(),
      mode: 'APPROVED_EXECUTION',
      allowShell: true,
      allowWrites: true,
    },
    approval,
  }
}

describe('executeGitTool', () => {
  it('throws on missing operation', async () => {
    await expect(executeGitTool({}, makeContext())).rejects.toThrow('Missing operation')
  })

  it('throws on invalid operation', async () => {
    await expect(executeGitTool({ operation: 'rebase' }, makeContext())).rejects.toThrow(
      'Invalid git operation',
    )
  })

  it('throws on null input', async () => {
    await expect(executeGitTool(null, makeContext())).rejects.toThrow('Missing operation')
  })

  it('blocks write operations in read-only mode', async () => {
    const output = await executeGitTool({ operation: 'add', args: ['.'] }, makeContext())

    expect(output).toContain('Allowed: no')
    expect(output).toContain('requires write permission')
  })

  it('executes read operations in read-only mode', async () => {
    const output = await executeGitTool({ operation: 'status' }, makeContext())

    expect(output).toContain('Git operation: status')
    expect(output).toContain('Exit code:')
    expect(output).toContain('Boundary:')
  })

  it('executes diff in read-only mode', async () => {
    const output = await executeGitTool({ operation: 'diff' }, makeContext())

    expect(output).toContain('Git operation: diff')
    expect(output).toContain('Command: git diff')
  })

  it('executes log in read-only mode', async () => {
    const output = await executeGitTool(
      { operation: 'log', args: ['--oneline', '-5'] },
      makeContext(),
    )

    expect(output).toContain('Git operation: log')
    expect(output).toContain('Command: git log --oneline -5')
  })

  it('executes branch in read-only mode', async () => {
    const output = await executeGitTool({ operation: 'branch' }, makeContext())

    expect(output).toContain('Git operation: branch')
  })

  it('blocks push to protected branches', async () => {
    const output = await executeGitTool(
      { operation: 'push', args: ['origin', 'main'] },
      makeApprovedContext(),
    )

    expect(output).toContain('Allowed: no')
    expect(output).toContain('protected branch')
  })

  it('blocks force push', async () => {
    const output = await executeGitTool(
      { operation: 'push', args: ['--force'] },
      makeApprovedContext(),
    )

    expect(output).toContain('Allowed: no')
    expect(output).toContain('Force push')
  })

  it('executes commit with message in approved mode', async () => {
    const output = await executeGitTool(
      { operation: 'commit', message: 'test commit' },
      makeApprovedContext(),
    )

    expect(output).toContain('Git operation: commit')
    expect(output).toContain('Command: git commit -m test commit')
  })

  it('handles checkout_new operation', async () => {
    const ctx = makeApprovedContext()
    const output = await executeGitTool(
      { operation: 'checkout_new', args: ['test-branch-' + Date.now()] },
      ctx,
    )

    expect(output).toContain('Git operation: checkout_new')
    expect(output).toContain('Command: git checkout -b')
  })
})
