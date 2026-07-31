import { promises as fs } from 'node:fs'
import path from 'node:path'

import type {
  DependencyLayerBindingStore,
  DependencyLayerBindingSummary,
} from './dependency-layer-binding-store.js'

const DEFAULT_MIN_ORPHAN_AGE_MS = 60 * 60 * 1000
const DEFAULT_MAX_REMOVALS = 500

/** Matches exactly the staging-directory name `materializeNpmDependencyLayer` creates via
 * `fs.mkdtemp(path.join(layersRoot, '.${safeId}-tmp-'))` -- never a broader pattern. */
const ORPHAN_TEMP_DIR_PATTERN = /^\..+-tmp-.+$/

export interface DependencyLayerReconciliationResult {
  readonly bindings: readonly DependencyLayerBindingSummary[]
  readonly orphanedTempDirsRemoved: number
  readonly orphanedTempDirsSkipped: number
}

export interface DependencyLayerReconciliationInput {
  /** The dependency-layers state root passed to `materializeNpmDependencyLayer` (the parent of
   * its `layers/` directory), not the `layers/` directory itself. */
  readonly stateRoot: string
  readonly bindingStore: DependencyLayerBindingStore
  /** Only a staging directory at least this old is removed, so a sweep can never race and delete
   * a materialization that is still legitimately in progress. */
  readonly minOrphanAgeMs?: number
  /** Caps how much filesystem work one reconciliation pass does, so boot never blocks on an
   * unbounded directory listing. */
  readonly maxRemovals?: number
  readonly now?: () => Date
}

/**
 * Read-mostly boot-time reconciliation for the dependency-layer subsystem: reports every binding's
 * verifiability (never mutates a binding) and removes only orphaned staging directories left behind
 * by a hard crash mid-materialization -- directories that were never referenced by any binding and
 * whose own naming convention identifies them as temporary. Never removes a directory that could be
 * a legitimate, still-verified layer; never reconstructs authority from what it finds; idempotent
 * (a second pass over the same state finds nothing left to remove).
 */
export async function reconcileDependencyLayers(
  input: DependencyLayerReconciliationInput,
): Promise<DependencyLayerReconciliationResult> {
  const bindings = await input.bindingStore.listBindings()

  const layersRoot = path.join(path.resolve(input.stateRoot), 'layers')
  const minAgeMs = input.minOrphanAgeMs ?? DEFAULT_MIN_ORPHAN_AGE_MS
  const maxRemovals = input.maxRemovals ?? DEFAULT_MAX_REMOVALS
  const now = input.now ?? (() => new Date())

  let entries: string[]
  try {
    entries = await fs.readdir(layersRoot)
  } catch (error) {
    if (isNotFound(error))
      return { bindings, orphanedTempDirsRemoved: 0, orphanedTempDirsSkipped: 0 }
    throw error
  }

  let removed = 0
  let skipped = 0
  for (const entry of entries) {
    if (!ORPHAN_TEMP_DIR_PATTERN.test(entry)) continue
    const fullPath = path.join(layersRoot, entry)
    const stat = await fs.lstat(fullPath).catch(() => undefined)
    if (stat === undefined || !stat.isDirectory()) continue

    const ageMs = now().getTime() - stat.mtime.getTime()
    if (ageMs < minAgeMs) {
      skipped += 1
      continue
    }
    if (removed >= maxRemovals) {
      skipped += 1
      continue
    }
    await fs.rm(fullPath, { recursive: true, force: true })
    removed += 1
  }

  return { bindings, orphanedTempDirsRemoved: removed, orphanedTempDirsSkipped: skipped }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ENOENT'
  )
}
