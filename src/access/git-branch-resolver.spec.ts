import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runGitCommand } from '../runtime/git/git-command-runner.js'
import { isLikelyDefaultBranch, resolveCurrentGitBranch } from './git-branch-resolver.js'

vi.setConfig({ testTimeout: 20_000 })

let cwd: string

beforeEach(async () => {
  cwd = mkdtempSync(join(tmpdir(), 'symbolwright-branch-resolver-'))
  await runGitCommand(['init'], cwd)
  await runGitCommand(['config', 'user.email', 'test@example.com'], cwd)
  await runGitCommand(['config', 'user.name', 'Test'], cwd)
  writeFileSync(join(cwd, 'a.txt'), 'a')
  await runGitCommand(['add', '.'], cwd)
  await runGitCommand(['commit', '-m', 'initial'], cwd)
  await runGitCommand(['branch', '-M', 'main'], cwd)
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

describe('resolveCurrentGitBranch', () => {
  it('resolves the checked-out branch name', async () => {
    expect(await resolveCurrentGitBranch(cwd)).toBe('main')
    await runGitCommand(['checkout', '-b', 'feat/x'], cwd)
    expect(await resolveCurrentGitBranch(cwd)).toBe('feat/x')
  })

  it('returns undefined outside a git repository', async () => {
    const nonRepo = mkdtempSync(join(tmpdir(), 'symbolwright-not-a-repo-'))
    try {
      expect(await resolveCurrentGitBranch(nonRepo)).toBeUndefined()
    } finally {
      rmSync(nonRepo, { recursive: true, force: true })
    }
  })

  it('returns undefined for a detached HEAD', async () => {
    const sha = (await runGitCommand(['rev-parse', 'HEAD'], cwd)).stdout.trim()
    await runGitCommand(['checkout', sha], cwd)
    expect(await resolveCurrentGitBranch(cwd)).toBeUndefined()
  })
})

describe('isLikelyDefaultBranch', () => {
  it('falls back to common default-branch names when there is no configured remote', async () => {
    expect(await isLikelyDefaultBranch(cwd, 'main')).toBe(true)
    expect(await isLikelyDefaultBranch(cwd, 'master')).toBe(true)
    expect(await isLikelyDefaultBranch(cwd, 'feat/x')).toBe(false)
  })

  it('prefers the real origin/HEAD symbolic ref when a remote is configured', async () => {
    const remoteDir = mkdtempSync(join(tmpdir(), 'symbolwright-branch-resolver-remote-'))
    try {
      await runGitCommand(['init', '--bare'], remoteDir)
      await runGitCommand(['remote', 'add', 'origin', remoteDir], cwd)
      await runGitCommand(['push', 'origin', 'main'], cwd)
      await runGitCommand(['branch', 'trunk'], cwd)
      await runGitCommand(['push', 'origin', 'trunk'], cwd)
      await runGitCommand(['remote', 'set-head', 'origin', 'trunk'], cwd)
      expect(await isLikelyDefaultBranch(cwd, 'trunk')).toBe(true)
      expect(await isLikelyDefaultBranch(cwd, 'main')).toBe(false)
    } finally {
      rmSync(remoteDir, { recursive: true, force: true })
    }
  })
})
