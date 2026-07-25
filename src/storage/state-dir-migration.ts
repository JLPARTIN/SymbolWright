import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import { LEGACY_STATE_DIR_NAME, STATE_DIR_NAME } from './storage-paths.js'

const IN_PROGRESS_MARKER = '.migration-in-progress'
const MIGRATED_MARKER = '.migrated-from-codemind'

export type StateDirMigrationStatus =
  | 'no_legacy'
  | 'migrated'
  | 'already_migrated'
  | 'conflict'
  | 'failed'

export interface StateDirMigrationResult {
  readonly status: StateDirMigrationStatus
  readonly legacyDir: string
  readonly canonicalDir: string
  readonly message: string
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/** Resolves a directory's real path if it exists, rejecting symlinks that escape `root`. */
function safeRealpath(root: string, dir: string): string | undefined {
  if (!existsSync(dir)) return undefined
  const resolved = realpathSync(dir)
  if (dir !== root && !isWithin(root, resolved) && resolved !== root) {
    throw new Error(`state directory "${dir}" resolves outside the expected root via a symlink`)
  }
  return resolved
}

/**
 * Migrates a legacy `.codemind` state directory to the canonical `.symbolwright`
 * location under `root`. Non-destructive: the legacy directory is renamed with a
 * `.migrated` suffix on success rather than deleted, so no user data is ever lost.
 * Idempotent and safe to call on every process start.
 */
export function migrateLegacyStateDir(root: string): StateDirMigrationResult {
  const legacyDir = path.join(root, LEGACY_STATE_DIR_NAME)
  const canonicalDir = path.join(root, STATE_DIR_NAME)

  let legacyExists: boolean
  let canonicalExists: boolean
  try {
    legacyExists = existsSync(legacyDir)
    canonicalExists = existsSync(canonicalDir)
  } catch (error) {
    return {
      status: 'failed',
      legacyDir,
      canonicalDir,
      message: `Unable to inspect state directories under "${root}": ${(error as Error).message}`,
    }
  }

  if (!legacyExists) {
    return {
      status: 'no_legacy',
      legacyDir,
      canonicalDir,
      message: 'No legacy .codemind directory found; nothing to migrate.',
    }
  }

  // Legacy path must be a real directory, not a file or a symlink escaping root.
  try {
    const legacyStat = lstatSync(legacyDir)
    if (legacyStat.isSymbolicLink()) {
      void safeRealpath(root, legacyDir)
    }
    if (!statSync(legacyDir).isDirectory()) {
      return {
        status: 'failed',
        legacyDir,
        canonicalDir,
        message: `Legacy state path "${legacyDir}" exists but is not a directory; skipping migration.`,
      }
    }
  } catch (error) {
    return {
      status: 'failed',
      legacyDir,
      canonicalDir,
      message: `Legacy state directory "${legacyDir}" is malformed or inaccessible: ${(error as Error).message}`,
    }
  }

  if (canonicalExists) {
    const migratedMarker = path.join(canonicalDir, MIGRATED_MARKER)
    const inProgressMarker = path.join(canonicalDir, IN_PROGRESS_MARKER)

    if (existsSync(migratedMarker)) {
      // Already migrated in a prior run; legacy dir is a retained backup copy.
      return {
        status: 'already_migrated',
        legacyDir,
        canonicalDir,
        message:
          'State already migrated to .symbolwright; legacy .codemind directory retained as a backup.',
      }
    }

    if (existsSync(inProgressMarker)) {
      // A prior migration was interrupted mid-copy. Safe to resume: re-copy
      // (idempotent, cpSync overwrites) then finalize.
      return finishMigration(root, legacyDir, canonicalDir, { resuming: true })
    }

    // Canonical directory exists with its own independent data and no
    // migration marker: this is a genuine conflict. Do not merge or
    // overwrite — surface it and let the active .symbolwright state stand.
    return {
      status: 'conflict',
      legacyDir,
      canonicalDir,
      message: `Both "${legacyDir}" and "${canonicalDir}" contain independent state. Using .symbolwright as active state; .codemind was left untouched. Inspect and reconcile manually if the legacy state is still needed.`,
    }
  }

  return finishMigration(root, legacyDir, canonicalDir, { resuming: false })
}

function finishMigration(
  root: string,
  legacyDir: string,
  canonicalDir: string,
  options: { resuming: boolean },
): StateDirMigrationResult {
  const inProgressMarker = path.join(canonicalDir, IN_PROGRESS_MARKER)
  const migratedMarker = path.join(canonicalDir, MIGRATED_MARKER)

  try {
    mkdirSync(canonicalDir, { recursive: true })
    writeFileSync(inProgressMarker, new Date().toISOString())

    cpSync(legacyDir, canonicalDir, { recursive: true, force: true })

    writeFileSync(
      migratedMarker,
      JSON.stringify(
        {
          migratedAt: new Date().toISOString(),
          migratedFrom: legacyDir,
          resumedInterruptedMigration: options.resuming,
        },
        null,
        2,
      ),
    )
    rmSync(inProgressMarker, { force: true })

    // Non-destructive: rename the legacy dir with a `.migrated` suffix instead
    // of deleting it, so the original data is always recoverable.
    const retiredLegacyDir = `${legacyDir}.migrated`
    try {
      if (!existsSync(retiredLegacyDir)) {
        renameSync(legacyDir, retiredLegacyDir)
      }
    } catch {
      // Renaming the legacy dir aside is best-effort (e.g. cross-device or
      // permission issues); the migration itself already succeeded.
    }

    return {
      status: 'migrated',
      legacyDir,
      canonicalDir,
      message: options.resuming
        ? `Resumed and completed an interrupted migration from "${legacyDir}" to "${canonicalDir}".`
        : `Migrated state from "${legacyDir}" to "${canonicalDir}".`,
    }
  } catch (error) {
    return {
      status: 'failed',
      legacyDir,
      canonicalDir,
      message: `Migration from "${legacyDir}" to "${canonicalDir}" failed: ${(error as Error).message}. Original .codemind data was left untouched and was not deleted or modified; re-run once the underlying issue (e.g. permissions) is resolved.`,
    }
  }
}
