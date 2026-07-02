import { describe, expect, it } from 'vitest'

import {
  evaluateGitHubWriteGate,
  renderGitHubWriteGateResult,
  type GitHubWriteGateRequest,
} from './github-write-gate.js'
import { createGitHubWriteGateAuditEvent } from './github-write-gate-audit.js'
import { githubWriteGateTool } from '../tools/github-write-gate-tool.js'
import type { RuntimeApproval, RuntimePolicySnapshot, RuntimeToolContext } from '../types.js'

const githubWritePolicy: RuntimePolicySnapshot = {
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
  ...githubWritePolicy,
  allowGitHubWrites: false,
}

const legacyApproval: RuntimeApproval = {
  ticketId: 'GH-WRITE-001',
  approvedBy: 'operator',
  scopes: ['github:write'],
}

function validRequest(overrides: Partial<GitHubWriteGateRequest> = {}): GitHubWriteGateRequest {
  return {
    action: 'post_comment',
    repository: 'owner/repo',
    targetRef: '42',
    content: 'Looks good.',
    reason: 'PR feedback',
    dryRun: true,
    ...overrides,
  }
}

function testContext(
  overrides: { policy?: RuntimePolicySnapshot; approval?: RuntimeApproval } = {},
): RuntimeToolContext {
  const ctx: RuntimeToolContext = {
    cwd: '/test',
    policy: overrides.policy ?? githubWritePolicy,
  }
  if (overrides.approval !== undefined) {
    return { ...ctx, approval: overrides.approval }
  }
  return ctx
}

describe('evaluateGitHubWriteGate', () => {
  it('allows valid requests without approval tickets when policy allows the surface', () => {
    const result = evaluateGitHubWriteGate(validRequest(), githubWritePolicy, undefined)

    expect(result.decision).toBe('ALLOWED')
    expect(result.blockReasons).toHaveLength(0)
  })

  it('ignores legacy approval data when policy allows the surface', () => {
    const result = evaluateGitHubWriteGate(validRequest(), githubWritePolicy, legacyApproval)

    expect(result.decision).toBe('ALLOWED')
    expect(result.blockReasons).toHaveLength(0)
  })

  it('blocks when policy disables the surface', () => {
    const result = evaluateGitHubWriteGate(validRequest(), blockedPolicy, undefined)

    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('GitHub writes are disabled by runtime policy.')
  })

  it('blocks invalid request shape', () => {
    const result = evaluateGitHubWriteGate(
      { action: '', repository: '', targetRef: '', content: '', reason: '', dryRun: true },
      githubWritePolicy,
      undefined,
    )

    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('GitHub write action must not be empty.')
    expect(result.blockReasons).toContain('Target repository must be specified.')
    expect(result.blockReasons).toContain('Write content must not be empty.')
  })

  it('blocks unsupported actions', () => {
    const result = evaluateGitHubWriteGate(
      validRequest({ action: 'unknown_action' }),
      githubWritePolicy,
      undefined,
    )

    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Action is not allowed: unknown_action')
  })
})

describe('renderGitHubWriteGateResult', () => {
  it('renders allowed dry-run output', () => {
    const result = evaluateGitHubWriteGate(
      validRequest({ dryRun: true }),
      githubWritePolicy,
      undefined,
    )
    const output = renderGitHubWriteGateResult(result)

    expect(output).toContain('CodeMind GitHub write gate')
    expect(output).toContain('Decision: ALLOWED')
    expect(output).toContain('Dry run: yes')
  })

  it('renders blocked output', () => {
    const result = evaluateGitHubWriteGate(validRequest(), blockedPolicy, undefined)
    const output = renderGitHubWriteGateResult(result)

    expect(output).toContain('Decision: BLOCKED')
    expect(output).toContain('Block reasons:')
  })
})

describe('createGitHubWriteGateAuditEvent', () => {
  it('creates allowed audit event without ticket metadata', () => {
    const result = evaluateGitHubWriteGate(validRequest(), githubWritePolicy, undefined)
    const event = createGitHubWriteGateAuditEvent(result, undefined)

    expect(event.action).toBe('github_write_gate')
    expect(event.status).toBe('allowed')
    expect(event.ticketId).toBeUndefined()
  })

  it('can preserve legacy ticket metadata when supplied', () => {
    const result = evaluateGitHubWriteGate(validRequest(), githubWritePolicy, legacyApproval)
    const event = createGitHubWriteGateAuditEvent(result, legacyApproval)

    expect(event.status).toBe('allowed')
    expect(event.ticketId).toBe('GH-WRITE-001')
  })
})

describe('githubWriteGateTool', () => {
  it('returns ALLOWED for valid input without approval', async () => {
    const output = await githubWriteGateTool.execute(validRequest(), testContext())

    expect(output).toContain('Decision: ALLOWED')
    expect(output).toContain('Runtime audit log')
  })

  it('returns BLOCKED when policy disables the surface', async () => {
    const output = await githubWriteGateTool.execute(
      validRequest(),
      testContext({ policy: blockedPolicy }),
    )

    expect(output).toContain('Decision: BLOCKED')
    expect(output).toContain('GitHub writes are disabled by runtime policy.')
  })

  it('rejects missing input', async () => {
    await expect(githubWriteGateTool.execute(null, testContext())).rejects.toThrow(
      'Missing GitHub write gate input.',
    )
  })
})
