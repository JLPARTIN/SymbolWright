import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runGitCommand } from './git-command-runner.js'

describe('runGitCommand', () => {
  let repoDir: string

  beforeEach(async () => {
    repoDir = mkdtempSync(join(tmpdir(), 'codemind-git-command-runner-'))
    await runGitCommand(['init'], repoDir)
    await runGitCommand(['config', 'user.email', 'test@example.com'], repoDir)
    await runGitCommand(['config', 'user.name', 'Test'], repoDir)
  })

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true })
  })

  it('captures stdout for a successful command', async () => {
    const result = await runGitCommand(['status', '--porcelain=v1'], repoDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('')
  })

  it('captures stdout for an untracked file', async () => {
    writeFileSync(join(repoDir, 'a.txt'), 'hello')
    const result = await runGitCommand(['status', '--porcelain=v1'], repoDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('?? a.txt')
  })

  it('captures a nonzero exit code and stderr for an invalid command', async () => {
    const result = await runGitCommand(['not-a-real-git-command'], repoDir)
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.length).toBeGreaterThan(0)
  })

  it('resolves with exitCode 1 when the git binary itself cannot run', async () => {
    const result = await runGitCommand(['status'], join(repoDir, 'does-not-exist'))
    expect(result.exitCode).not.toBe(0)
  })
})
