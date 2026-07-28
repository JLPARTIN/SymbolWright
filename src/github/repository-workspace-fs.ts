import { lstat, readdir, realpath, rm, statfs, unlink } from 'node:fs/promises'
import path from 'node:path'

/**
 * Filesystem-safety helpers shared by acquisition (cap enforcement, cleanup-on-failure) and
 * retention (quarantine, prune) for external-repository workspaces. Kept independent of both so
 * neither module has to duplicate the symlink-safe deletion logic.
 */

export class WorkspaceLimitExceededError extends Error {}

/**
 * Deletes `target` (a workspace directory or a lone file) without ever traversing into an
 * attacker-controlled symlink. `realpath()`-then-recurse is unsafe here: it would resolve a
 * symlinked `target` itself and can be tricked into recursing through whatever it points at.
 * Instead: `lstat` the candidate first; a symlink is unlinked directly and never traversed; a
 * real directory has its canonical path checked against `root` before anything is deleted, and
 * only then is `fs.rm` used (which itself does not follow symlinks it encounters while
 * recursing, so nested symlinks are never traversed either).
 */
export async function removeWorkspaceSafely(root: string, target: string): Promise<void> {
  const resolvedRoot = path.resolve(root)
  const stat = await lstat(target).catch(() => undefined)
  if (stat === undefined) return

  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    await unlink(target)
    return
  }

  const canonical = await realpath(target)
  if (canonical !== resolvedRoot && !canonical.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(
      `Refusing to delete a workspace whose real path escaped the controlled root: ${target}`,
    )
  }
  await rm(target, { recursive: true, force: true })
}

export interface WorkspaceStats {
  readonly fileCount: number
  readonly totalBytes: number
  readonly maxFileBytes: number
}

export interface ComputeWorkspaceStatsLimits {
  readonly maxFileCount?: number
  readonly maxTotalBytes?: number
  readonly maxFileBytes?: number
  /** `Date.now()`-style deadline; the walk aborts once past it. */
  readonly deadlineAt?: number
}

/**
 * Recursively walks `root` (never following symlinks — each entry is `lstat`ed, and a symlink is
 * counted by its own size, not the size of what it points at) accumulating file count and byte
 * totals. Throws `WorkspaceLimitExceededError` as soon as any configured limit is crossed, so a
 * hostile huge workspace is rejected quickly rather than being walked to completion first.
 */
export async function computeWorkspaceStats(
  root: string,
  limits: ComputeWorkspaceStatsLimits = {},
): Promise<WorkspaceStats> {
  let fileCount = 0
  let totalBytes = 0
  let maxFileBytes = 0

  function checkLimits(): void {
    if (limits.deadlineAt !== undefined && Date.now() > limits.deadlineAt) {
      throw new WorkspaceLimitExceededError('Workspace size scan exceeded its time budget.')
    }
    if (limits.maxFileCount !== undefined && fileCount > limits.maxFileCount) {
      throw new WorkspaceLimitExceededError(
        `Workspace file count exceeds the configured limit of ${limits.maxFileCount}.`,
      )
    }
    if (limits.maxTotalBytes !== undefined && totalBytes > limits.maxTotalBytes) {
      throw new WorkspaceLimitExceededError(
        `Workspace total size exceeds the configured limit of ${limits.maxTotalBytes} bytes.`,
      )
    }
    if (limits.maxFileBytes !== undefined && maxFileBytes > limits.maxFileBytes) {
      throw new WorkspaceLimitExceededError(
        `A file in the workspace exceeds the configured limit of ${limits.maxFileBytes} bytes.`,
      )
    }
  }

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        await walk(full)
        continue
      }
      const entryStat = await lstat(full)
      fileCount += 1
      totalBytes += entryStat.size
      maxFileBytes = Math.max(maxFileBytes, entryStat.size)
      checkLimits()
    }
  }

  await walk(root)
  return { fileCount, totalBytes, maxFileBytes }
}

export interface DiskHeadroomResult {
  readonly ok: boolean
  readonly freeBytes: number
}

/** Checks free-disk headroom on the filesystem containing `existingPath` before any clone I/O
 * starts, so acquisition can reject up front instead of filling the disk mid-clone. */
export async function checkDiskHeadroom(
  existingPath: string,
  minFreeBytes: number,
): Promise<DiskHeadroomResult> {
  const stats = await statfs(existingPath)
  const freeBytes = stats.bavail * stats.bsize
  return { ok: freeBytes >= minFreeBytes, freeBytes }
}
