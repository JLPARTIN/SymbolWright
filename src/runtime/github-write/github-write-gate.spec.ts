import { describe, expect, it } from 'vitest'

import {
  evaluateGitHubWriteGate,
  renderGitHubWriteGateResult,
  type GitHubWriteGateRequest,
} from './github-write-gate.js'
import { createGitHubWriteGateAuditEvent } from './github-write-gate-audit.js'
import { githubWriteGateTool } from '../tools/github-write-gate-tool.js'
import { createGitHubWriteGateRuntimeRegistry } from '../runtime-github-write-gate-registry.js'
import { renderRuntimeGitHubWriteGate } from '../../cli-runtime-github-write-gate.js'
import type { RuntimeApproval, RuntimePolicySnapshot, RuntimeToolContext } from '../types.js'

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const githubWritePolicy: RuntimePolicySnapshot = {
  mode: 'APPROVED_EXECUTION',
  allowNetwork: false,
  allowShell: false,
  allowWrites: false,
  allowGitHubWrites: true,
  protectedPaths: [],
  noisyDirs: [],
}

const readOnlyPolicy: RuntimePolicySnapshot = {
  mode: 'READ_ONLY',
  allowNetwork: false,
  allowShell: false,
  allowWrites: false,
  allowGitHubWrites: false,
  protectedPaths: [],
  noisyDirs: [],
}

const validApproval: RuntimeApproval = {
  ticketId: 'GH-WRITE-001',
  approvedBy: 'operator',
  scopes: ['github:write'],
}

const wrongScopeApproval: RuntimeApproval = {
  ticketId: 'GH-WRITE-002',
  approvedBy: 'operator',
  scopes: ['file:write'],
}

function validRequest(overrides: Partial<GitHubWriteGateRequest> = {}): GitHubWriteGateRequest {
  return {
    action: 'create_draft_pr',
    repository: 'owner/repo',
    targetRef: 'main',
    content: 'Phase P: GitHub write gate',
    reason: 'Deliver Phase P',
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
  it('returns ALLOWED for valid create_draft_pr with policy and approval', () => {
    const result = evaluateGitHubWriteGate(validRequest(), githubWritePolicy, validApproval)
    expect(result.decision).toBe('ALLOWED')
    expect(result.action).toBe('create_draft_pr')
    expect(result.blockReasons).toHaveLength(0)
  })

  it('returns ALLOWED for post_comment action', () => {
    const result = evaluateGitHubWriteGate(
      validRequest({ action: 'post_comment' }),
      githubWritePolicy,
      validApproval,
    )
    expect(result.decision).toBe('ALLOWED')
  })

  it('returns ALLOWED for apply_label action', () => {
    const result = evaluateGitHubWriteGate(
      validRequest({ action: 'apply_label' }),
      githubWritePolicy,
      validApproval,
    )
    expect(result.decision).toBe('ALLOWED')
  })

  it('blocks when policy disables GitHub writes', () => {
    const result = evaluateGitHubWriteGate(validRequest(), readOnlyPolicy, validApproval)
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('GitHub writes are disabled by runtime policy.')
  })

  it('blocks when no approval ticket', () => {
    const result = evaluateGitHubWriteGate(validRequest(), githubWritePolicy, undefined)
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Approval ticket is required for GitHub writes.')
  })

  it('blocks when approval has wrong scope', () => {
    const result = evaluateGitHubWriteGate(validRequest(), githubWritePolicy, wrongScopeApproval)
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Approval ticket is missing required scope: github:write')
  })

  it('blocks empty action', () => {
    const result = evaluateGitHubWriteGate(
      validRequest({ action: '' }),
      githubWritePolicy,
      validApproval,
    )
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('GitHub write action must not be empty.')
  })

  it('blocks disallowed action merge_pr', () => {
    const result = evaluateGitHubWriteGate(
      validRequest({ action: 'merge_pr' }),
      githubWritePolicy,
      validApproval,
    )
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Action is not allowed: merge_pr')
  })

  it('blocks disallowed action force_push', () => {
    const result = evaluateGitHubWriteGate(
      validRequest({ action: 'force_push' }),
      githubWritePolicy,
      validApproval,
    )
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Action is not allowed: force_push')
  })

  it('blocks empty repository', () => {
    const result = evaluateGitHubWriteGate(
      validRequest({ repository: '' }),
      githubWritePolicy,
      validApproval,
    )
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Target repository must be specified.')
  })

  it('blocks empty targetRef', () => {
    const result = evaluateGitHubWriteGate(
      validRequest({ targetRef: '' }),
      githubWritePolicy,
      validApproval,
    )
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain(
      'Target reference (PR number, issue, or branch) must be specified.',
    )
  })

  it('blocks empty content', () => {
    const result = evaluateGitHubWriteGate(
      validRequest({ content: '' }),
      githubWritePolicy,
      validApproval,
    )
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Write content must not be empty.')
  })

  it('blocks empty reason', () => {
    const result = evaluateGitHubWriteGate(
      validRequest({ reason: '' }),
      githubWritePolicy,
      validApproval,
    )
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('GitHub write request must include a reason.')
  })

  it('accumulates multiple block reasons', () => {
    const result = evaluateGitHubWriteGate(
      { action: 'merge_pr', repository: '', targetRef: '', content: '', reason: '', dryRun: true },
      readOnlyPolicy,
      undefined,
    )
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons.length).toBeGreaterThanOrEqual(5)
  })

  it('preserves dryRun flag in result', () => {
    const dryResult = evaluateGitHubWriteGate(
      validRequest({ dryRun: true }),
      githubWritePolicy,
      validApproval,
    )
    expect(dryResult.dryRun).toBe(true)

    const liveResult = evaluateGitHubWriteGate(
      validRequest({ dryRun: false }),
      githubWritePolicy,
      validApproval,
    )
    expect(liveResult.dryRun).toBe(false)
  })
})

describe('renderGitHubWriteGateResult', () => {
  it('renders ALLOWED dry-run result', () => {
    const result = evaluateGitHubWriteGate(
      validRequest({ dryRun: true }),
      githubWritePolicy,
      validApproval,
    )
    const output = renderGitHubWriteGateResult(result)

    expect(output).toContain('CodeMind GitHub write gate')
    expect(output).toContain('Decision: ALLOWED')
    expect(output).toContain('Action: create_draft_pr')
    expect(output).toContain('Dry run: yes')
    expect(output).toContain('Dry-run preview: GitHub write would be allowed.')
    expect(output).toContain('No GitHub API call has been made.')
  })

  it('renders ALLOWED non-dry-run result', () => {
    const result = evaluateGitHubWriteGate(
      validRequest({ dryRun: false }),
      githubWritePolicy,
      validApproval,
    )
    const output = renderGitHubWriteGateResult(result)

    expect(output).toContain('Decision: ALLOWED')
    expect(output).toContain('Dry run: no')
    expect(output).toContain('GitHub write is allowed by policy and approval.')
    expect(output).toContain('No GitHub API call is made by this tool.')
  })

  it('renders BLOCKED result with block reasons', () => {
    const result = evaluateGitHubWriteGate(validRequest(), readOnlyPolicy, undefined)
    const output = renderGitHubWriteGateResult(result)

    expect(output).toContain('Decision: BLOCKED')
    expect(output).toContain('Block reasons:')
    expect(output).not.toContain('Dry-run preview')
  })
})

describe('createGitHubWriteGateAuditEvent', () => {
  it('creates allowed audit event with ticket', () => {
    const result = evaluateGitHubWriteGate(validRequest(), githubWritePolicy, validApproval)
    const event = createGitHubWriteGateAuditEvent(result, validApproval)

    expect(event.action).toBe('github_write_gate')
    expect(event.status).toBe('allowed')
    expect(event.ticketId).toBe('GH-WRITE-001')
    expect(event.detail).toContain('create_draft_pr')
  })

  it('creates blocked audit event without ticket', () => {
    const result = evaluateGitHubWriteGate(validRequest(), readOnlyPolicy, undefined)
    const event = createGitHubWriteGateAuditEvent(result, undefined)

    expect(event.action).toBe('github_write_gate')
    expect(event.status).toBe('blocked')
    expect(event.ticketId).toBeUndefined()
    expect(event.detail).toContain('blocked')
  })

  it('creates blocked audit event with ticket for wrong scope', () => {
    const result = evaluateGitHubWriteGate(validRequest(), githubWritePolicy, wrongScopeApproval)
    const event = createGitHubWriteGateAuditEvent(result, wrongScopeApproval)

    expect(event.status).toBe('blocked')
    expect(event.ticketId).toBe('GH-WRITE-002')
  })

  it('includes dry-run in allowed detail', () => {
    const result = evaluateGitHubWriteGate(
      validRequest({ dryRun: true }),
      githubWritePolicy,
      validApproval,
    )
    const event = createGitHubWriteGateAuditEvent(result, validApproval)
    expect(event.detail).toContain('Dry-run')
  })

  it('includes reason in non-dry-run allowed detail', () => {
    const result = evaluateGitHubWriteGate(
      validRequest({ dryRun: false, reason: 'Ship it' }),
      githubWritePolicy,
      validApproval,
    )
    const event = createGitHubWriteGateAuditEvent(result, validApproval)
    expect(event.detail).toContain('Ship it')
    expect(event.detail).toContain('allowed')
  })
})

describe('githubWriteGateTool', () => {
  it('has correct name and capability', () => {
    expect(githubWriteGateTool.name).toBe('github_write_gate')
    expect(githubWriteGateTool.capability).toBe('GITHUB_WRITE_GATE')
  })

  it('executes with valid input and returns BLOCKED without approval', async () => {
    const output = await githubWriteGateTool.execute(
      {
        action: 'post_comment',
        repository: 'owner/repo',
        targetRef: '42',
        content: 'Looks good!',
        reason: 'PR feedback',
      },
      testContext(),
    )

    expect(output).toContain('Decision: BLOCKED')
    expect(output).toContain('Approval ticket is required')
    expect(output).toContain('Runtime audit log')
  })

  it('executes with valid input and approval returns ALLOWED', async () => {
    const output = await githubWriteGateTool.execute(
      {
        action: 'create_draft_pr',
        repository: 'owner/repo',
        targetRef: 'main',
        content: 'Phase P delivery',
        reason: 'Ship Phase P',
      },
      testContext({ approval: validApproval }),
    )

    expect(output).toContain('Decision: ALLOWED')
    expect(output).toContain('Dry-run preview')
  })

  it('defaults dryRun to true', async () => {
    const output = await githubWriteGateTool.execute(
      {
        action: 'apply_label',
        repository: 'owner/repo',
        targetRef: '10',
        content: 'enhancement',
        reason: 'Categorize',
      },
      testContext({ approval: validApproval }),
    )

    expect(output).toContain('Dry run: yes')
  })

  it('rejects missing input', async () => {
    await expect(githubWriteGateTool.execute(null, testContext())).rejects.toThrow(
      'Missing GitHub write gate input.',
    )
  })

  it('rejects missing action', async () => {
    await expect(
      githubWriteGateTool.execute({ repository: 'owner/repo', reason: 'y' }, testContext()),
    ).rejects.toThrow('Missing action.')
  })

  it('rejects missing repository', async () => {
    await expect(
      githubWriteGateTool.execute({ action: 'post_comment', reason: 'y' }, testContext()),
    ).rejects.toThrow('Missing repository.')
  })

  it('rejects missing reason', async () => {
    await expect(
      githubWriteGateTool.execute(
        { action: 'post_comment', repository: 'owner/repo' },
        testContext(),
      ),
    ).rejects.toThrow('Missing reason.')
  })

  it('blocks disallowed action through gate', async () => {
    const output = await githubWriteGateTool.execute(
      {
        action: 'merge_pr',
        repository: 'owner/repo',
        targetRef: '42',
        content: 'Merge this',
        reason: 'Merge',
      },
      testContext({ approval: validApproval }),
    )

    expect(output).toContain('Decision: BLOCKED')
    expect(output).toContain('Action is not allowed: merge_pr')
  })

  it('blocks when policy disables GitHub writes through tool', async () => {
    const output = await githubWriteGateTool.execute(
      {
        action: 'post_comment',
        repository: 'owner/repo',
        targetRef: '42',
        content: 'Hello',
        reason: 'Greeting',
      },
      testContext({ policy: readOnlyPolicy, approval: validApproval }),
    )

    expect(output).toContain('Decision: BLOCKED')
    expect(output).toContain('GitHub writes are disabled by runtime policy.')
  })
})

describe('createGitHubWriteGateRuntimeRegistry', () => {
  it('includes the github_write_gate tool', () => {
    const registry = createGitHubWriteGateRuntimeRegistry({})
    const tool = registry.getOrThrow('github_write_gate')
    expect(tool.name).toBe('github_write_gate')
  })

  it('preserves all previous registry tools', () => {
    const registry = createGitHubWriteGateRuntimeRegistry({})
    const tools = registry.list()
    const names = tools.map((t) => t.name)

    expect(names).toContain('plan_goal')
    expect(names).toContain('read_file')
    expect(names).toContain('github_write_proposal')
    expect(names).toContain('github_write_gate')
  })
})

describe('renderRuntimeGitHubWriteGate (CLI)', () => {
  it('renders gate result from valid fixture', async () => {
    const fixture = {
      action: 'create_draft_pr',
      repository: 'owner/repo',
      targetRef: 'main',
      content: 'Phase P delivery',
      reason: 'Deliver Phase P',
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-write-gate-'))
    const fixturePath = path.join(dir, 'fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    const output = await renderRuntimeGitHubWriteGate(fixturePath)
    expect(output).toContain('CodeMind GitHub write gate')
    expect(output).toContain('Runtime audit log')

    fs.rmSync(dir, { recursive: true })
  })

  it('rejects fixture with missing action', async () => {
    const fixture = { repository: 'owner/repo', reason: 'test' }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-write-gate-'))
    const fixturePath = path.join(dir, 'fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    await expect(renderRuntimeGitHubWriteGate(fixturePath)).rejects.toThrow(
      'Fixture must include a non-empty "action" field.',
    )

    fs.rmSync(dir, { recursive: true })
  })

  it('rejects fixture with missing repository', async () => {
    const fixture = { action: 'post_comment', reason: 'test' }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-write-gate-'))
    const fixturePath = path.join(dir, 'fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    await expect(renderRuntimeGitHubWriteGate(fixturePath)).rejects.toThrow(
      'Fixture must include a non-empty "repository" field.',
    )

    fs.rmSync(dir, { recursive: true })
  })

  it('rejects fixture with missing reason', async () => {
    const fixture = { action: 'post_comment', repository: 'owner/repo' }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-write-gate-'))
    const fixturePath = path.join(dir, 'fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    await expect(renderRuntimeGitHubWriteGate(fixturePath)).rejects.toThrow(
      'Fixture must include a non-empty "reason" field.',
    )

    fs.rmSync(dir, { recursive: true })
  })

  it('defaults dryRun to true in CLI', async () => {
    const fixture = {
      action: 'apply_label',
      repository: 'owner/repo',
      targetRef: '10',
      content: 'enhancement',
      reason: 'Categorize',
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-write-gate-'))
    const fixturePath = path.join(dir, 'fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    const output = await renderRuntimeGitHubWriteGate(fixturePath)
    expect(output).toContain('Dry run: yes')

    fs.rmSync(dir, { recursive: true })
  })
})
