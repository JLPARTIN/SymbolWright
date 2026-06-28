import { describe, expect, it } from 'vitest'

import {
  ALLOWED_GITHUB_WRITE_ACTIONS,
  evaluateGitHubWriteProposal,
  renderGitHubWriteProposal,
  type GitHubWriteProposalInput,
} from './github-write-proposal.js'
import { createGitHubWriteProposalAuditEvent } from './github-write-proposal-audit.js'
import { githubWriteProposalTool } from '../tools/github-write-proposal-tool.js'
import { createFixtureRegistry } from '../registry/fixture-registry-factory.js'
import { renderRuntimeGitHubWriteProposal } from '../../cli-runtime-github-write-proposal.js'
import type { RuntimeToolContext } from '../types.js'

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

function validInput(overrides: Partial<GitHubWriteProposalInput> = {}): GitHubWriteProposalInput {
  return {
    action: 'create_draft_pr',
    repository: 'owner/repo',
    targetRef: 'main',
    content: 'Phase O: GitHub write proposal',
    reason: 'Deliver Phase O PR',
    ...overrides,
  }
}

function testContext(): RuntimeToolContext {
  return {
    cwd: '/test',
    policy: {
      mode: 'APPROVED_EXECUTION',
      allowNetwork: false,
      allowShell: false,
      allowWrites: false,
      allowGitHubWrites: false,
      protectedPaths: [],
      noisyDirs: [],
    },
  }
}

describe('evaluateGitHubWriteProposal', () => {
  it('returns PROPOSED for a valid create_draft_pr action', () => {
    const result = evaluateGitHubWriteProposal(validInput())
    expect(result.decision).toBe('PROPOSED')
    expect(result.action).toBe('create_draft_pr')
    expect(result.repository).toBe('owner/repo')
    expect(result.targetRef).toBe('main')
    expect(result.blockReasons).toHaveLength(0)
  })

  it('returns PROPOSED for post_comment action', () => {
    const result = evaluateGitHubWriteProposal(validInput({ action: 'post_comment' }))
    expect(result.decision).toBe('PROPOSED')
    expect(result.action).toBe('post_comment')
  })

  it('returns PROPOSED for apply_label action', () => {
    const result = evaluateGitHubWriteProposal(validInput({ action: 'apply_label' }))
    expect(result.decision).toBe('PROPOSED')
    expect(result.action).toBe('apply_label')
  })

  it('blocks empty action', () => {
    const result = evaluateGitHubWriteProposal(validInput({ action: '' }))
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('GitHub write action must not be empty.')
  })

  it('blocks whitespace-only action', () => {
    const result = evaluateGitHubWriteProposal(validInput({ action: '   ' }))
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('GitHub write action must not be empty.')
  })

  it('blocks disallowed action merge_pr', () => {
    const result = evaluateGitHubWriteProposal(validInput({ action: 'merge_pr' }))
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Action is not allowed: merge_pr')
  })

  it('blocks disallowed action force_push', () => {
    const result = evaluateGitHubWriteProposal(validInput({ action: 'force_push' }))
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Action is not allowed: force_push')
  })

  it('blocks disallowed action delete_branch', () => {
    const result = evaluateGitHubWriteProposal(validInput({ action: 'delete_branch' }))
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Action is not allowed: delete_branch')
  })

  it('blocks empty repository', () => {
    const result = evaluateGitHubWriteProposal(validInput({ repository: '' }))
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Target repository must be specified.')
  })

  it('blocks whitespace-only repository', () => {
    const result = evaluateGitHubWriteProposal(validInput({ repository: '   ' }))
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Target repository must be specified.')
  })

  it('blocks empty targetRef', () => {
    const result = evaluateGitHubWriteProposal(validInput({ targetRef: '' }))
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain(
      'Target reference (PR number, issue, or branch) must be specified.',
    )
  })

  it('blocks empty content', () => {
    const result = evaluateGitHubWriteProposal(validInput({ content: '' }))
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Proposal content must not be empty.')
  })

  it('blocks empty reason', () => {
    const result = evaluateGitHubWriteProposal(validInput({ reason: '' }))
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Proposal must include a reason.')
  })

  it('accumulates multiple block reasons', () => {
    const result = evaluateGitHubWriteProposal({
      action: 'merge_pr',
      repository: '',
      targetRef: '',
      content: '',
      reason: '',
    })
    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons.length).toBeGreaterThanOrEqual(4)
  })

  it('preserves input values in result', () => {
    const input = validInput({
      content: 'Add feature X',
      reason: 'Feature delivery',
    })
    const result = evaluateGitHubWriteProposal(input)
    expect(result.content).toBe('Add feature X')
    expect(result.reason).toBe('Feature delivery')
  })
})

describe('ALLOWED_GITHUB_WRITE_ACTIONS', () => {
  it('includes create_draft_pr', () => {
    expect(ALLOWED_GITHUB_WRITE_ACTIONS).toContain('create_draft_pr')
  })

  it('includes post_comment', () => {
    expect(ALLOWED_GITHUB_WRITE_ACTIONS).toContain('post_comment')
  })

  it('includes apply_label', () => {
    expect(ALLOWED_GITHUB_WRITE_ACTIONS).toContain('apply_label')
  })

  it('has exactly 3 allowed actions', () => {
    expect(ALLOWED_GITHUB_WRITE_ACTIONS).toHaveLength(3)
  })
})

describe('renderGitHubWriteProposal', () => {
  it('renders PROPOSED result with content', () => {
    const result = evaluateGitHubWriteProposal(validInput())
    const output = renderGitHubWriteProposal(result)

    expect(output).toContain('CodeMind GitHub write proposal')
    expect(output).toContain('Decision: PROPOSED')
    expect(output).toContain('Action: create_draft_pr')
    expect(output).toContain('Repository: owner/repo')
    expect(output).toContain('Target ref: main')
    expect(output).toContain('Proposed content:')
    expect(output).toContain('Phase O: GitHub write proposal')
    expect(output).toContain('PROPOSAL_ONLY')
    expect(output).not.toContain('Block reasons:')
  })

  it('renders BLOCKED result with block reasons', () => {
    const result = evaluateGitHubWriteProposal(validInput({ action: 'merge_pr' }))
    const output = renderGitHubWriteProposal(result)

    expect(output).toContain('Decision: BLOCKED')
    expect(output).toContain('Block reasons:')
    expect(output).toContain('Action is not allowed: merge_pr')
    expect(output).not.toContain('Proposed content:')
  })

  it('includes PROPOSAL_ONLY status for all results', () => {
    const proposed = evaluateGitHubWriteProposal(validInput())
    const blocked = evaluateGitHubWriteProposal(validInput({ action: 'merge_pr' }))

    expect(renderGitHubWriteProposal(proposed)).toContain('PROPOSAL_ONLY')
    expect(renderGitHubWriteProposal(blocked)).toContain('PROPOSAL_ONLY')
  })

  it('includes safety notice in output', () => {
    const result = evaluateGitHubWriteProposal(validInput())
    const output = renderGitHubWriteProposal(result)
    expect(output).toContain('No GitHub API call has been made')
  })
})

describe('createGitHubWriteProposalAuditEvent', () => {
  it('creates allowed audit event for PROPOSED', () => {
    const result = evaluateGitHubWriteProposal(validInput())
    const event = createGitHubWriteProposalAuditEvent(result)

    expect(event.action).toBe('github_write_proposal')
    expect(event.status).toBe('allowed')
    expect(event.detail).toContain('create_draft_pr')
    expect(event.detail).toContain('owner/repo')
  })

  it('creates blocked audit event for BLOCKED', () => {
    const result = evaluateGitHubWriteProposal(validInput({ action: 'merge_pr' }))
    const event = createGitHubWriteProposalAuditEvent(result)

    expect(event.action).toBe('github_write_proposal')
    expect(event.status).toBe('blocked')
    expect(event.detail).toContain('blocked')
  })

  it('includes reason in allowed audit event', () => {
    const result = evaluateGitHubWriteProposal(validInput({ reason: 'Deliver feature' }))
    const event = createGitHubWriteProposalAuditEvent(result)
    expect(event.detail).toContain('Deliver feature')
  })

  it('includes block reasons in blocked audit event', () => {
    const result = evaluateGitHubWriteProposal(validInput({ reason: '' }))
    const event = createGitHubWriteProposalAuditEvent(result)
    expect(event.detail).toContain('Proposal must include a reason.')
  })

  it('has no ticketId since proposal does not require approval', () => {
    const result = evaluateGitHubWriteProposal(validInput())
    const event = createGitHubWriteProposalAuditEvent(result)
    expect(event.ticketId).toBeUndefined()
  })
})

describe('githubWriteProposalTool', () => {
  it('has correct name and capability', () => {
    expect(githubWriteProposalTool.name).toBe('github_write_proposal')
    expect(githubWriteProposalTool.capability).toBe('GITHUB_WRITE_PROPOSAL')
  })

  it('executes with valid input', async () => {
    const output = await githubWriteProposalTool.execute(
      {
        action: 'post_comment',
        repository: 'owner/repo',
        targetRef: '42',
        content: 'Looks good!',
        reason: 'PR feedback',
      },
      testContext(),
    )

    expect(output).toContain('Decision: PROPOSED')
    expect(output).toContain('Action: post_comment')
    expect(output).toContain('Runtime audit log')
  })

  it('rejects missing input', async () => {
    await expect(githubWriteProposalTool.execute(null, testContext())).rejects.toThrow(
      'Missing GitHub write proposal input.',
    )
  })

  it('rejects missing action', async () => {
    await expect(
      githubWriteProposalTool.execute(
        { repository: 'owner/repo', targetRef: '1', content: 'x', reason: 'y' },
        testContext(),
      ),
    ).rejects.toThrow('Missing action.')
  })

  it('rejects missing repository', async () => {
    await expect(
      githubWriteProposalTool.execute(
        { action: 'post_comment', targetRef: '1', content: 'x', reason: 'y' },
        testContext(),
      ),
    ).rejects.toThrow('Missing repository.')
  })

  it('blocks missing targetRef through evaluator', async () => {
    const output = await githubWriteProposalTool.execute(
      { action: 'post_comment', repository: 'owner/repo', content: 'x', reason: 'y' },
      testContext(),
    )
    expect(output).toContain('Decision: BLOCKED')
    expect(output).toContain('Target reference')
  })

  it('blocks missing content through evaluator', async () => {
    const output = await githubWriteProposalTool.execute(
      { action: 'post_comment', repository: 'owner/repo', targetRef: '1', reason: 'y' },
      testContext(),
    )
    expect(output).toContain('Decision: BLOCKED')
    expect(output).toContain('Proposal content must not be empty.')
  })

  it('rejects missing reason', async () => {
    await expect(
      githubWriteProposalTool.execute(
        { action: 'post_comment', repository: 'owner/repo', targetRef: '1', content: 'x' },
        testContext(),
      ),
    ).rejects.toThrow('Missing reason.')
  })

  it('blocks disallowed action through tool', async () => {
    const output = await githubWriteProposalTool.execute(
      {
        action: 'merge_pr',
        repository: 'owner/repo',
        targetRef: '42',
        content: 'Merge this',
        reason: 'Merge',
      },
      testContext(),
    )

    expect(output).toContain('Decision: BLOCKED')
    expect(output).toContain('Action is not allowed: merge_pr')
  })
})

describe('createGitHubWriteProposalRuntimeRegistry', () => {
  it('includes the github_write_proposal tool', () => {
    const registry = createFixtureRegistry('github_write_proposal')
    const tool = registry.getOrThrow('github_write_proposal')
    expect(tool.name).toBe('github_write_proposal')
  })

  it('preserves all previous registry tools', () => {
    const registry = createFixtureRegistry('github_write_proposal')
    const tools = registry.list()
    const names = tools.map((t) => t.name)

    expect(names).toContain('plan_goal')
    expect(names).toContain('read_file')
    expect(names).toContain('pr_preparation')
    expect(names).toContain('github_write_proposal')
  })
})

describe('renderRuntimeGitHubWriteProposal (CLI)', () => {
  it('renders proposal from valid fixture', async () => {
    const fixture = {
      action: 'create_draft_pr',
      repository: 'owner/repo',
      targetRef: 'main',
      content: 'Phase O delivery',
      reason: 'Deliver Phase O',
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-write-proposal-'))
    const fixturePath = path.join(dir, 'fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    const output = await renderRuntimeGitHubWriteProposal(fixturePath)
    expect(output).toContain('Decision: PROPOSED')
    expect(output).toContain('Action: create_draft_pr')
    expect(output).toContain('Runtime audit log')

    fs.rmSync(dir, { recursive: true })
  })

  it('rejects fixture with missing action', async () => {
    const fixture = {
      repository: 'owner/repo',
      reason: 'Deliver Phase O',
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-write-proposal-'))
    const fixturePath = path.join(dir, 'fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    await expect(renderRuntimeGitHubWriteProposal(fixturePath)).rejects.toThrow(
      'Fixture must include a non-empty "action" field.',
    )

    fs.rmSync(dir, { recursive: true })
  })

  it('rejects fixture with missing repository', async () => {
    const fixture = {
      action: 'post_comment',
      reason: 'Deliver Phase O',
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-write-proposal-'))
    const fixturePath = path.join(dir, 'fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    await expect(renderRuntimeGitHubWriteProposal(fixturePath)).rejects.toThrow(
      'Fixture must include a non-empty "repository" field.',
    )

    fs.rmSync(dir, { recursive: true })
  })

  it('rejects fixture with missing reason', async () => {
    const fixture = {
      action: 'post_comment',
      repository: 'owner/repo',
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-write-proposal-'))
    const fixturePath = path.join(dir, 'fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    await expect(renderRuntimeGitHubWriteProposal(fixturePath)).rejects.toThrow(
      'Fixture must include a non-empty "reason" field.',
    )

    fs.rmSync(dir, { recursive: true })
  })

  it('defaults missing targetRef and content to empty strings for gate evaluation', async () => {
    const fixture = {
      action: 'apply_label',
      repository: 'owner/repo',
      reason: 'Label it',
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-write-proposal-'))
    const fixturePath = path.join(dir, 'fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    const output = await renderRuntimeGitHubWriteProposal(fixturePath)
    expect(output).toContain('Decision: BLOCKED')
    expect(output).toContain('Target reference')
    expect(output).toContain('Proposal content must not be empty.')

    fs.rmSync(dir, { recursive: true })
  })
})
