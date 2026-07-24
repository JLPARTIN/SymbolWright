import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runGitCommand } from '../runtime/git/git-command-runner.js'
import { createGitHubOperationsPolicy } from './github-operations-policy.js'
import {
  preparePrOperationPacket,
  renderPrOperationPacket,
  type PrOperationPacketInput,
} from './pr-operation-packet.js'

describe('preparePrOperationPacket', () => {
  let repositoryRoot: string

  beforeEach(async () => {
    repositoryRoot = mkdtempSync(join(tmpdir(), 'codemind-pr-packet-'))
    await runGitCommand(['init'], repositoryRoot)
    await runGitCommand(['config', 'user.email', 'test@example.com'], repositoryRoot)
    await runGitCommand(['config', 'user.name', 'Test'], repositoryRoot)
    writeFileSync(join(repositoryRoot, 'a.txt'), 'hello')
    await runGitCommand(['add', 'a.txt'], repositoryRoot)
    await runGitCommand(['commit', '-m', 'initial'], repositoryRoot)
    await runGitCommand(['branch', '-m', 'main'], repositoryRoot)
  })

  afterEach(() => {
    rmSync(repositoryRoot, { recursive: true, force: true })
  })

  function baseInput(overrides: Partial<PrOperationPacketInput> = {}): PrOperationPacketInput {
    return {
      repositoryRoot,
      branchName: 'codemind/fix-thing',
      baseBranch: 'main',
      objective: 'Fix the thing',
      changedFiles: [],
      validationEvidence: [],
      policy: createGitHubOperationsPolicy(),
      ...overrides,
    }
  }

  it('creates a local branch, stages and commits changed files, and marks the packet ready to push', async () => {
    writeFileSync(join(repositoryRoot, 'b.txt'), 'changed')
    const packet = await preparePrOperationPacket(
      baseInput({ changedFiles: [{ path: 'b.txt', changeType: 'added' }] }),
    )

    expect(packet.branchCreated).toBe(true)
    expect(packet.stagedFiles).toEqual(['b.txt'])
    expect(packet.commitCreated).toBe(true)
    expect(packet.commitSha).toMatch(/^[0-9a-f]{40}$/)
    expect(packet.readyToPush).toBe(true)

    const branch = await runGitCommand(['branch', '--show-current'], repositoryRoot)
    expect(branch.stdout.trim()).toBe('codemind/fix-thing')
    const log = await runGitCommand(['log', '--oneline', '-1'], repositoryRoot)
    expect(log.stdout).toContain('Fix the thing')
  })

  it('does not commit when there are no changed files, and is not ready to push', async () => {
    const packet = await preparePrOperationPacket(baseInput())
    expect(packet.branchCreated).toBe(true)
    expect(packet.stagedFiles).toEqual([])
    expect(packet.commitCreated).toBe(false)
    expect(packet.readyToPush).toBe(false)
    expect(packet.prBody).toContain('No files were changed.')
  })

  it('reports honest branch-creation failure when the branch already exists', async () => {
    await runGitCommand(['branch', 'codemind/fix-thing'], repositoryRoot)
    const packet = await preparePrOperationPacket(baseInput())
    expect(packet.branchCreated).toBe(false)
    expect(packet.commitCreated).toBe(false)
    expect(packet.readyToPush).toBe(false)
    expect(packet.evidence.some((line) => line.includes('Failed to create local branch'))).toBe(
      true,
    )
  })

  it('redacts secrets from validation evidence before they reach the PR body', async () => {
    const packet = await preparePrOperationPacket(
      baseInput({
        validationEvidence: [
          {
            command: 'npm test',
            status: 'passed',
            summary: 'Auth header used token: ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ',
          },
        ],
      }),
    )
    expect(packet.prBody).not.toContain('ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ')
    expect(packet.prBody).toContain('[REDACTED]')
  })

  it('includes portability, repair attempts, and risk flags in the PR body', async () => {
    const packet = await preparePrOperationPacket(
      baseInput({
        portability: {
          schemaVersion: 1,
          repositoryRoot,
          ecosystems: ['node'],
          primaryEcosystem: 'node',
          mixed: false,
          manifests: ['package.json'],
          validation: [],
          validationCommands: ['npm test'],
          confidence: 'high',
          researchQueries: [],
          evidence: [],
        },
        repairAttempts: [{ attempt: 1, summary: 'fixed lint error', outcome: 'passed' }],
        riskFlags: ['mixed-ecosystem-repository'],
      }),
    )
    expect(packet.prBody).toContain('Ecosystems: node')
    expect(packet.prBody).toContain('Attempt 1: PASSED')
    expect(packet.prBody).toContain('mixed-ecosystem-repository')
  })

  it('reports a mixed repository as "yes" in the PR body, not just the single-ecosystem case', async () => {
    const packet = await preparePrOperationPacket(
      baseInput({
        portability: {
          schemaVersion: 1,
          repositoryRoot,
          ecosystems: ['node', 'python'],
          primaryEcosystem: 'node',
          mixed: true,
          manifests: ['package.json', 'pyproject.toml'],
          validation: [],
          validationCommands: [],
          confidence: 'medium',
          researchQueries: [],
          evidence: [],
        },
      }),
    )
    expect(packet.prBody).toContain('Mixed repository: yes')
  })

  it('uses only the first line of a multi-line objective as the PR title', async () => {
    const packet = await preparePrOperationPacket(
      baseInput({ objective: 'Fix the thing\n\nMore detail on the second line.' }),
    )
    expect(packet.prTitle).toBe('Fix the thing')
  })

  it('falls back to a branch-derived title when the objective is empty', async () => {
    const packet = await preparePrOperationPacket(baseInput({ objective: '   ' }))
    expect(packet.prTitle).toBe('Update from CodeMind mission (codemind/fix-thing)')
  })

  it('notes a changed file as "not staged" when staging it fails', async () => {
    const packet = await preparePrOperationPacket(
      baseInput({
        changedFiles: [{ path: 'does-not-exist-on-disk.txt', changeType: 'modified' }],
      }),
    )
    expect(packet.stagedFiles).toEqual([])
    expect(packet.prBody).toContain('does-not-exist-on-disk.txt` (modified) — not staged')
  })

  it('includes rollback notes referencing the base and working branches', async () => {
    const packet = await preparePrOperationPacket(baseInput())
    expect(packet.rollbackNotes.join(' ')).toContain('git checkout main')
    expect(packet.rollbackNotes.join(' ')).toContain('git branch -D codemind/fix-thing')
  })

  it('reports writesAllowed and pullRequestCreationAllowed from the policy', async () => {
    const restricted = await preparePrOperationPacket(baseInput())
    expect(restricted.writesAllowed).toBe(false)
    expect(restricted.pullRequestCreationAllowed).toBe(false)

    await runGitCommand(['checkout', 'main'], repositoryRoot)
    await runGitCommand(['branch', '-D', 'codemind/fix-thing'], repositoryRoot)
    const permissive = await preparePrOperationPacket(
      baseInput({
        policy: createGitHubOperationsPolicy({
          enabledOperations: ['push_branch', 'open_pull_request'],
        }),
      }),
    )
    expect(permissive.writesAllowed).toBe(true)
    expect(permissive.pullRequestCreationAllowed).toBe(true)
  })

  it('renders a full human-readable packet report', async () => {
    const packet = await preparePrOperationPacket(baseInput())
    const rendered = renderPrOperationPacket(packet)
    expect(rendered).toContain('CodeMind PR Operation Packet')
    expect(rendered).toContain('Branch: codemind/fix-thing (from main)')
    expect(rendered).toContain('PR title: Fix the thing')
  })
})
