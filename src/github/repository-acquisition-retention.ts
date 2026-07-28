import { lstat, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { MissionService } from '../mission/mission-service.js'
import { withAcquisitionRootLock } from './acquisition-root-lock.js'
import { resolveAcquisitionRoot } from './repository-acquisition.js'
import { computeWorkspaceStats, removeWorkspaceSafely } from './repository-workspace-fs.js'

/**
 * Retention for acquired external-repository workspaces (`repository-acquisition.ts`). A
 * workspace is prunable only once **no retained mission at all** references it — not just no
 * `ACTIVE` mission, since a paused, failed, completed, or imported mission may still need its
 * repository for reopening, export, or audit. Pruning is two-phase (quarantine, then delete after
 * a grace window) so a sweep racing a newly created mission reference can be recovered from: the
 * final deletion step rechecks references one more time and restores the workspace if a mission
 * started pointing at it during the grace window.
 */

export interface RepositoryRetentionPolicy {
  readonly quarantineGraceMs?: number
  readonly maxQuarantineCount?: number
  readonly maxQuarantineBytes?: number
}

export const DEFAULT_RETENTION_POLICY: Required<RepositoryRetentionPolicy> = {
  quarantineGraceMs: 24 * 60 * 60 * 1000,
  maxQuarantineCount: 50,
  maxQuarantineBytes: 20 * 1024 * 1024 * 1024,
}

function resolveQuarantineRoot(workspaceRoot: string): string {
  return path.join(path.resolve(workspaceRoot), '.symbolwright', 'external-repos-quarantine')
}

interface QuarantineMetadata {
  readonly originalPath: string
  readonly quarantinedAt: string
}

function metadataPath(quarantineEntryPath: string): string {
  return `${quarantineEntryPath}.meta.json`
}

/** Every repository root path referenced by any mission still in the store, regardless of
 * status -- a mission is only ever removed from this set by being actually deleted. */
async function collectReferencedRepositoryRoots(
  missionService: MissionService,
): Promise<ReadonlySet<string>> {
  const referenced = new Set<string>()
  const pageSize = 200
  let offset = 0
  for (;;) {
    const page = missionService.list({ offset, limit: pageSize })
    for (const summary of page.missions) {
      referenced.add(path.resolve(summary.repositoryRoot))
    }
    if (page.missions.length === 0) break
    offset += page.missions.length
    if (offset >= page.total) break
  }
  return referenced
}

/** Top-level directories under `acquisitionRoot`, `lstat`-checked rather than trusting `Dirent`
 * type flags, so a symlink planted at the root is never mistaken for a real acquired workspace. */
async function listAcquiredWorkspaceDirs(acquisitionRoot: string): Promise<string[]> {
  let names: string[]
  try {
    names = await readdir(acquisitionRoot)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const dirs: string[] = []
  for (const name of names) {
    const full = path.join(acquisitionRoot, name)
    const stat = await lstat(full).catch(() => undefined)
    if (stat?.isDirectory() === true) dirs.push(full)
  }
  return dirs
}

export interface QuarantineOrphanedWorkspacesResult {
  readonly quarantined: readonly string[]
  readonly skippedReferenced: number
}

export interface RetentionSweepOptions {
  readonly workspaceRoot: string
  readonly missionService: MissionService
  readonly policy?: RepositoryRetentionPolicy
  readonly now?: () => Date
}

/**
 * Phase one: moves every acquired workspace not referenced by any retained mission into the
 * quarantine directory, recording its original location so it can be restored later if needed.
 * Runs under the acquisition-root lock, shared with `performExternalRepositoryIntake`, so a
 * workspace can't be quarantined in the exact window between its acquisition finishing and the
 * mission that will reference it actually being created.
 */
export async function quarantineOrphanedWorkspaces(
  options: RetentionSweepOptions,
): Promise<QuarantineOrphanedWorkspacesResult> {
  const acquisitionRoot = resolveAcquisitionRoot(options.workspaceRoot)
  const quarantineRoot = resolveQuarantineRoot(options.workspaceRoot)
  const now = options.now ?? (() => new Date())

  return withAcquisitionRootLock(acquisitionRoot, async () => {
    const referenced = await collectReferencedRepositoryRoots(options.missionService)
    const workspaces = await listAcquiredWorkspaceDirs(acquisitionRoot)

    const quarantined: string[] = []
    let skippedReferenced = 0
    for (const workspacePath of workspaces) {
      if (referenced.has(path.resolve(workspacePath))) {
        skippedReferenced += 1
        continue
      }

      await mkdir(quarantineRoot, { recursive: true, mode: 0o700 })
      const quarantinePath = path.join(
        quarantineRoot,
        `${path.basename(workspacePath)}-${now().getTime()}`,
      )
      await rename(workspacePath, quarantinePath)
      const metadata: QuarantineMetadata = {
        originalPath: workspacePath,
        quarantinedAt: now().toISOString(),
      }
      await writeFile(metadataPath(quarantinePath), JSON.stringify(metadata), { mode: 0o600 })
      quarantined.push(quarantinePath)
    }

    return { quarantined, skippedReferenced }
  })
}

export interface FinalizeQuarantineResult {
  readonly deleted: readonly string[]
  readonly restored: readonly string[]
  readonly stillWithinGrace: number
}

/**
 * Phase two: for each quarantined workspace whose grace window has elapsed (or whose presence
 * pushes the quarantine directory over its count/byte retention budget), rechecks mission
 * references one more time. If a mission has started referencing the original path since it was
 * quarantined, the workspace is restored there instead of deleted and the recovery is reported;
 * otherwise it is deleted via the symlink-safe path.
 */
export async function finalizeQuarantine(
  options: RetentionSweepOptions,
): Promise<FinalizeQuarantineResult> {
  const acquisitionRoot = resolveAcquisitionRoot(options.workspaceRoot)
  const quarantineRoot = resolveQuarantineRoot(options.workspaceRoot)
  const policy = { ...DEFAULT_RETENTION_POLICY, ...options.policy }
  const now = options.now ?? (() => new Date())

  return withAcquisitionRootLock(acquisitionRoot, async () => {
    let names: string[]
    try {
      names = await readdir(quarantineRoot)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { deleted: [], restored: [], stillWithinGrace: 0 }
      }
      throw error
    }

    const entries: { readonly path: string; readonly metadata: QuarantineMetadata }[] = []
    for (const name of names) {
      if (name.endsWith('.meta.json')) continue
      const full = path.join(quarantineRoot, name)
      const stat = await lstat(full).catch(() => undefined)
      if (stat?.isDirectory() !== true) continue
      try {
        const raw = await readFile(metadataPath(full), 'utf8')
        entries.push({ path: full, metadata: JSON.parse(raw) as QuarantineMetadata })
      } catch {
        // No readable metadata: treat conservatively as just-quarantined so it isn't finalized
        // before its grace window can be evaluated on a future sweep.
        entries.push({
          path: full,
          metadata: { originalPath: full, quarantinedAt: now().toISOString() },
        })
      }
    }

    entries.sort(
      (a, b) =>
        new Date(a.metadata.quarantinedAt).getTime() - new Date(b.metadata.quarantinedAt).getTime(),
    )

    const sized: { readonly entry: (typeof entries)[number]; readonly bytes: number }[] = []
    let totalBytes = 0
    for (const entry of entries) {
      const stats = await computeWorkspaceStats(entry.path).catch(() => ({
        fileCount: 0,
        totalBytes: 0,
        maxFileBytes: 0,
      }))
      totalBytes += stats.totalBytes
      sized.push({ entry, bytes: stats.totalBytes })
    }

    const deleted: string[] = []
    const restored: string[] = []
    let stillWithinGrace = 0
    let remainingCount = entries.length
    let remainingBytes = totalBytes

    for (const { entry, bytes } of sized) {
      const ageMs = now().getTime() - new Date(entry.metadata.quarantinedAt).getTime()
      const overBudget =
        remainingCount > policy.maxQuarantineCount || remainingBytes > policy.maxQuarantineBytes
      const eligible = ageMs >= policy.quarantineGraceMs || overBudget

      if (!eligible) {
        stillWithinGrace += 1
        continue
      }

      // Final-reference recheck, closing the residual race the acquisition-root lock alone
      // cannot: a mission may have started referencing the original path after it was
      // quarantined but before this finalize pass ran.
      const referenced = await collectReferencedRepositoryRoots(options.missionService)
      if (referenced.has(path.resolve(entry.metadata.originalPath))) {
        await mkdir(path.dirname(entry.metadata.originalPath), { recursive: true })
        await rename(entry.path, entry.metadata.originalPath)
        await removeWorkspaceSafely(quarantineRoot, metadataPath(entry.path))
        restored.push(entry.metadata.originalPath)
      } else {
        await removeWorkspaceSafely(quarantineRoot, metadataPath(entry.path))
        await removeWorkspaceSafely(quarantineRoot, entry.path)
        deleted.push(entry.path)
      }
      remainingCount -= 1
      remainingBytes -= bytes
    }

    return { deleted, restored, stillWithinGrace }
  })
}

export interface PruneAcquisitionRootResult
  extends QuarantineOrphanedWorkspacesResult, FinalizeQuarantineResult {}

/** Runs both retention phases in one call -- the shape an operator-invocable prune command (and,
 * later, a startup boot sweep) wants: quarantine anything newly orphaned, then finalize whatever
 * in quarantine has aged out or is pushing the quarantine directory over its retention budget. */
export async function pruneAcquisitionRoot(
  options: RetentionSweepOptions,
): Promise<PruneAcquisitionRootResult> {
  const quarantineResult = await quarantineOrphanedWorkspaces(options)
  const finalizeResult = await finalizeQuarantine(options)
  return { ...quarantineResult, ...finalizeResult }
}

export { resolveQuarantineRoot }
