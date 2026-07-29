import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  checkDiskHeadroom,
  computeAvailableDiskBytes,
  computeWorkspaceStats,
  removeWorkspaceSafely,
  WorkspaceLimitExceededError,
} from './repository-workspace-fs.js'

describe('repository-workspace-fs', () => {
  let root: string
  let outside: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'symbolwright-workspace-fs-root-'))
    outside = mkdtempSync(join(tmpdir(), 'symbolwright-workspace-fs-outside-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })

  describe('removeWorkspaceSafely', () => {
    it('deletes a real directory inside the root', async () => {
      const target = join(root, 'workspace')
      mkdirSync(target)
      writeFileSync(join(target, 'a.txt'), 'hello')

      await removeWorkspaceSafely(root, target)

      expect(existsSync(target)).toBe(false)
    })

    it('is a no-op when the target is already gone', async () => {
      await expect(
        removeWorkspaceSafely(root, join(root, 'does-not-exist')),
      ).resolves.toBeUndefined()
    })

    it('unlinks a symlinked target directly, never traversing into it', async () => {
      const outsideContent = join(outside, 'keep-me.txt')
      writeFileSync(outsideContent, 'must survive')
      const link = join(root, 'link-to-outside')
      symlinkSync(outside, link, 'dir')

      await removeWorkspaceSafely(root, link)

      expect(existsSync(link)).toBe(false)
      expect(existsSync(outsideContent)).toBe(true)
    })

    it('refuses to delete a directory whose canonical path escapes the controlled root', async () => {
      const realOutsideDir = join(outside, 'real-dir')
      mkdirSync(realOutsideDir)
      writeFileSync(join(realOutsideDir, 'f.txt'), 'data')
      // A symlinked *ancestor* directory, not the final path segment itself -- lstat on the full
      // target path still reports a real directory (the final component), so this exercises the
      // realpath-containment check rather than the top-level-symlink short-circuit.
      const linkedAncestor = join(root, 'linked-ancestor')
      symlinkSync(outside, linkedAncestor, 'dir')
      const target = join(linkedAncestor, 'real-dir')

      await expect(removeWorkspaceSafely(root, target)).rejects.toThrow(
        /escaped the controlled root/,
      )
      expect(existsSync(realOutsideDir)).toBe(true)
    })
  })

  describe('computeWorkspaceStats', () => {
    it('counts files and bytes recursively', async () => {
      writeFileSync(join(root, 'a.txt'), '12345')
      mkdirSync(join(root, 'nested'))
      writeFileSync(join(root, 'nested', 'b.txt'), '1234567')

      const stats = await computeWorkspaceStats(root)

      expect(stats.fileCount).toBe(2)
      expect(stats.totalBytes).toBe(12)
      expect(stats.maxFileBytes).toBe(7)
    })

    it('counts a symlinked entry by its own size without following it', async () => {
      const bigFile = join(outside, 'big.txt')
      writeFileSync(bigFile, 'x'.repeat(1000))
      symlinkSync(bigFile, join(root, 'link.txt'))

      const stats = await computeWorkspaceStats(root)

      expect(stats.fileCount).toBe(1)
      expect(stats.totalBytes).toBeLessThan(1000)
    })

    it('does not recurse into a symlinked subdirectory', async () => {
      mkdirSync(join(outside, 'huge'))
      writeFileSync(join(outside, 'huge', 'f.txt'), 'x'.repeat(1000))
      symlinkSync(outside, join(root, 'link-dir'), 'dir')

      const stats = await computeWorkspaceStats(root)

      expect(stats.fileCount).toBe(1)
      expect(stats.totalBytes).toBeLessThan(1000)
    })

    it('throws WorkspaceLimitExceededError once maxFileCount is crossed', async () => {
      writeFileSync(join(root, 'a.txt'), 'a')
      writeFileSync(join(root, 'b.txt'), 'b')

      await expect(computeWorkspaceStats(root, { maxFileCount: 1 })).rejects.toThrow(
        WorkspaceLimitExceededError,
      )
    })

    it('throws WorkspaceLimitExceededError once maxTotalBytes is crossed', async () => {
      writeFileSync(join(root, 'a.txt'), 'x'.repeat(100))

      await expect(computeWorkspaceStats(root, { maxTotalBytes: 10 })).rejects.toThrow(
        WorkspaceLimitExceededError,
      )
    })

    it('throws WorkspaceLimitExceededError once maxFileBytes is crossed', async () => {
      writeFileSync(join(root, 'a.txt'), 'x'.repeat(100))

      await expect(computeWorkspaceStats(root, { maxFileBytes: 10 })).rejects.toThrow(
        WorkspaceLimitExceededError,
      )
    })

    it('throws WorkspaceLimitExceededError once the deadline has passed', async () => {
      writeFileSync(join(root, 'a.txt'), 'a')

      await expect(computeWorkspaceStats(root, { deadlineAt: Date.now() - 1 })).rejects.toThrow(
        WorkspaceLimitExceededError,
      )
    })
  })

  describe('checkDiskHeadroom', () => {
    it('reports ok when the free-space requirement is trivially satisfied', async () => {
      const result = await checkDiskHeadroom(root, 0)
      expect(result.ok).toBe(true)
      expect(result.freeBytes).toBeGreaterThanOrEqual(0)
    })

    it('reports not ok when the free-space requirement cannot possibly be satisfied', async () => {
      const result = await checkDiskHeadroom(root, Number.MAX_SAFE_INTEGER)
      expect(result.ok).toBe(false)
    })

    it('computes unprivileged free space from bavail rather than bfree', () => {
      const stats = { bavail: 22, bfree: 24, bsize: 4096 }

      expect(computeAvailableDiskBytes(stats)).toBe(stats.bavail * stats.bsize)
      expect(computeAvailableDiskBytes(stats)).not.toBe(stats.bfree * stats.bsize)
    })

    it('normalizes bigint statfs values deterministically', () => {
      expect(computeAvailableDiskBytes({ bavail: 22n, bsize: 4096n })).toBe(90_112)
    })
  })
})
