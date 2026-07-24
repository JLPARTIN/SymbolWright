import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runGitCommand } from '../runtime/git/git-command-runner.js'
import type { GitHubRepositoryTarget } from './github-repository-target.js'
import {
  RepositoryAcquisitionError,
  acquireExternalRepository,
  duplicateLocalRepository,
  resolveAcquisitionRoot,
} from './repository-acquisition.js'

function target(overrides: Partial<GitHubRepositoryTarget> = {}): GitHubRepositoryTarget {
  return {
    host: 'github.com',
    owner: 'JLPARTIN',
    repo: 'CodeMind',
    targetType: 'repository',
    sourceUrl: 'https://github.com/JLPARTIN/CodeMind',
    canonicalHttpsUrl: 'https://github.com/JLPARTIN/CodeMind',
    ...overrides,
  }
}

describe('repository acquisition', () => {
  let workspaceRoot: string
  let sourceRepo: string

  beforeEach(async () => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'codemind-acquisition-workspace-'))
    sourceRepo = mkdtempSync(join(tmpdir(), 'codemind-acquisition-source-'))
    await runGitCommand(['init'], sourceRepo)
    await runGitCommand(['config', 'user.email', 'test@example.com'], sourceRepo)
    await runGitCommand(['config', 'user.name', 'Test'], sourceRepo)
    writeFileSync(join(sourceRepo, 'a.txt'), 'hello')
    await runGitCommand(['add', 'a.txt'], sourceRepo)
    await runGitCommand(['commit', '-m', 'initial'], sourceRepo)
    await runGitCommand(['branch', '-m', 'main'], sourceRepo)
  })

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true })
    rmSync(sourceRepo, { recursive: true, force: true })
  })

  describe('acquireExternalRepository', () => {
    it('reports a plan without touching the filesystem in dry-run mode', async () => {
      const result = await acquireExternalRepository({
        target: target({ canonicalHttpsUrl: `file://${sourceRepo}` }),
        workspaceRoot,
        mode: 'dry-run',
      })
      expect(result.acquired).toBe(false)
      expect(result.mode).toBe('dry-run')
      expect(result.evidence.some((line) => line.includes('Dry-run'))).toBe(true)
      expect(result.workspacePath.startsWith(resolveAcquisitionRoot(workspaceRoot))).toBe(true)
    })

    it('clones a repository into the controlled workspace and verifies HEAD', async () => {
      const result = await acquireExternalRepository({
        target: target({ canonicalHttpsUrl: `file://${sourceRepo}` }),
        workspaceRoot,
        mode: 'writable',
      })
      expect(result.acquired).toBe(true)
      expect(result.headSha).toMatch(/^[0-9a-f]{40}$/)
      expect(result.workspacePath.startsWith(resolveAcquisitionRoot(workspaceRoot))).toBe(true)
    })

    it('checks out a requested ref after cloning', async () => {
      await runGitCommand(['checkout', '-b', 'feature-branch'], sourceRepo)
      writeFileSync(join(sourceRepo, 'b.txt'), 'feature')
      await runGitCommand(['add', 'b.txt'], sourceRepo)
      await runGitCommand(['commit', '-m', 'feature commit'], sourceRepo)

      const result = await acquireExternalRepository({
        target: target({ canonicalHttpsUrl: `file://${sourceRepo}` }),
        workspaceRoot,
        mode: 'writable',
        ref: 'feature-branch',
      })
      expect(result.acquired).toBe(true)
      expect(result.checkedOutRef).toBe('feature-branch')
      const branch = await runGitCommand(['branch', '--show-current'], result.workspacePath)
      expect(branch.stdout.trim()).toBe('feature-branch')
    })

    it('reports honest failure for a nonexistent ref instead of silently keeping the default branch', async () => {
      const result = await acquireExternalRepository({
        target: target({ canonicalHttpsUrl: `file://${sourceRepo}` }),
        workspaceRoot,
        mode: 'writable',
        ref: 'does-not-exist',
      })
      expect(result.acquired).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.evidence.some((line) => line.includes('Checkout'))).toBe(true)
    })

    it('reports honest clone failure for an unreachable source instead of a false success', async () => {
      const result = await acquireExternalRepository({
        target: target({ canonicalHttpsUrl: `file:///nonexistent/path/does-not-exist` }),
        workspaceRoot,
        mode: 'writable',
      })
      expect(result.acquired).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('does not misreport a broken default-branch checkout as an empty repository when real commits exist', async () => {
      const bareRoot = mkdtempSync(join(tmpdir(), 'codemind-acquisition-bare-'))
      try {
        await runGitCommand(['init', '--bare'], bareRoot)
        await runGitCommand(['remote', 'add', 'origin', bareRoot], sourceRepo)
        await runGitCommand(['push', 'origin', 'main'], sourceRepo)
        // Simulate a bare "remote" whose HEAD pointer was never updated to
        // match the branch that was actually pushed (git init --bare
        // defaults HEAD to a branch name that may not exist).
        await runGitCommand(['symbolic-ref', 'HEAD', 'refs/heads/nonexistent-default'], bareRoot)

        const result = await acquireExternalRepository({
          target: target({ canonicalHttpsUrl: `file://${bareRoot}` }),
          workspaceRoot,
          mode: 'writable',
        })
        expect(result.acquired).toBe(false)
        expect(result.error).toContain('no default branch was checked out')
        expect(result.evidence.join(' ')).not.toContain('empty repository')
      } finally {
        rmSync(bareRoot, { recursive: true, force: true })
      }
    })

    it('rejects an unsafe ref before any git operation runs', async () => {
      await expect(
        acquireExternalRepository({
          target: target({ canonicalHttpsUrl: `file://${sourceRepo}` }),
          workspaceRoot,
          mode: 'writable',
          ref: '--upload-pack=evil',
        }),
      ).rejects.toThrow(RepositoryAcquisitionError)

      await expect(
        acquireExternalRepository({
          target: target({ canonicalHttpsUrl: `file://${sourceRepo}` }),
          workspaceRoot,
          mode: 'writable',
          ref: '../../etc/passwd',
        }),
      ).rejects.toThrow(RepositoryAcquisitionError)
    })

    it('never computes a destination outside the controlled acquisition root', async () => {
      const result = await acquireExternalRepository({
        target: target({
          owner: '../../../../etc',
          canonicalHttpsUrl: `file://${sourceRepo}`,
        }),
        workspaceRoot,
        mode: 'dry-run',
      })
      const root = resolveAcquisitionRoot(workspaceRoot)
      expect(result.workspacePath.startsWith(`${root}/`)).toBe(true)
    })
  })

  describe('duplicateLocalRepository', () => {
    it('reports a plan without duplicating in dry-run mode', async () => {
      const result = await duplicateLocalRepository({
        sourceLocalPath: sourceRepo,
        workspaceRoot,
        mode: 'dry-run',
        slug: 'my-local-repo',
      })
      expect(result.acquired).toBe(false)
      expect(result.strategy).toBe('duplicate-local')
    })

    it('duplicates a local repository into an isolated workspace', async () => {
      const result = await duplicateLocalRepository({
        sourceLocalPath: sourceRepo,
        workspaceRoot,
        mode: 'writable',
        slug: 'my-local-repo',
      })
      expect(result.acquired).toBe(true)
      expect(result.headSha).toMatch(/^[0-9a-f]{40}$/)
      expect(result.workspacePath).not.toBe(sourceRepo)
    })

    it('mutating the duplicate never touches the original repository', async () => {
      const result = await duplicateLocalRepository({
        sourceLocalPath: sourceRepo,
        workspaceRoot,
        mode: 'writable',
        slug: 'my-local-repo',
      })
      writeFileSync(join(result.workspacePath, 'mutated.txt'), 'changed in the duplicate')
      await runGitCommand(['add', 'mutated.txt'], result.workspacePath)
      await runGitCommand(['commit', '-m', 'mutate duplicate'], result.workspacePath)

      const originalLog = await runGitCommand(['log', '--oneline'], sourceRepo)
      expect(originalLog.stdout).not.toContain('mutate duplicate')
      const originalStatus = await runGitCommand(['status', '--porcelain'], sourceRepo)
      expect(originalStatus.stdout.trim()).toBe('')
    })

    it('reports a repository with zero commits honestly rather than as a hidden failure', async () => {
      const emptyRepo = mkdtempSync(join(tmpdir(), 'codemind-acquisition-empty-'))
      await runGitCommand(['init'], emptyRepo)
      try {
        const result = await duplicateLocalRepository({
          sourceLocalPath: emptyRepo,
          workspaceRoot,
          mode: 'writable',
          slug: 'empty-repo',
        })
        expect(result.acquired).toBe(true)
        expect(result.headSha).toBeUndefined()
        expect(result.evidence.some((line) => line.includes('no commits'))).toBe(true)
      } finally {
        rmSync(emptyRepo, { recursive: true, force: true })
      }
    })

    it('rejects a nonexistent source path', async () => {
      await expect(
        duplicateLocalRepository({
          sourceLocalPath: join(workspaceRoot, 'does-not-exist'),
          workspaceRoot,
          mode: 'writable',
          slug: 'missing',
        }),
      ).rejects.toThrow(RepositoryAcquisitionError)
    })

    it('rejects a source path that is not a git repository', async () => {
      const notARepo = mkdtempSync(join(tmpdir(), 'codemind-acquisition-notrepo-'))
      try {
        await expect(
          duplicateLocalRepository({
            sourceLocalPath: notARepo,
            workspaceRoot,
            mode: 'writable',
            slug: 'not-a-repo',
          }),
        ).rejects.toThrow(RepositoryAcquisitionError)
      } finally {
        rmSync(notARepo, { recursive: true, force: true })
      }
    })
  })
})
