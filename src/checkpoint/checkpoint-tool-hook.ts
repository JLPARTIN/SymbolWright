import fs from 'node:fs'

import type { RuntimeToolContext } from '../runtime/types.js'

import { createCheckpoint } from './checkpoint-service.js'
import { resolveCheckpointSessionId } from './checkpoint-session.js'
import type { CheckpointFileSnapshot, CheckpointTool } from './checkpoint-types.js'

/** Reads a file's current on-disk state, for capturing a snapshot right before a write. */
export function snapshotFileBeforeWrite(
  resolvedPath: string,
  targetPath: string,
): CheckpointFileSnapshot {
  const existedBefore = fs.existsSync(resolvedPath)
  const originalContent = existedBefore ? fs.readFileSync(resolvedPath, 'utf-8') : null
  return { targetPath, resolvedPath, existedBefore, originalContent }
}

/**
 * Persists a checkpoint for one or more already-captured file snapshots.
 * A no-op when there's nothing to snapshot (e.g. a blocked or dry-run write
 * that never touched disk) — callers only invoke this once a write is known
 * to have actually happened.
 */
export function checkpointBeforeWrite(
  context: RuntimeToolContext,
  tool: CheckpointTool,
  files: readonly CheckpointFileSnapshot[],
  reason?: string,
): void {
  if (files.length === 0) return

  createCheckpoint({
    workspaceRoot: context.cwd,
    sessionId: resolveCheckpointSessionId(context.sessionId),
    tool,
    files,
    ...(reason !== undefined ? { reason } : {}),
  })
}
