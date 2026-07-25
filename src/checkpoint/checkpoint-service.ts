import path from 'node:path'

import type { RuntimeAuditEvent, RuntimeAuditLog } from '../runtime/audit/runtime-audit-log.js'
import { createAuditEvent } from '../runtime/audit/runtime-audit-log.js'
import { assertWriteApproved, isPathInsideWorkspace } from '../runtime/policy/runtime-policy.js'
import type { RuntimeApproval, RuntimePolicySnapshot } from '../runtime/types.js'
import { atomicWriteFile } from '../runtime/fs/atomic-write.js'

import { sha256Hex } from './checkpoint-hash.js'
import { generateCheckpointId } from './checkpoint-session.js'
import {
  deleteFileIfExists,
  findCheckpointDirById,
  listCheckpointIdsForSession,
  listSessionIds,
  readCheckpointMetadata,
  readSnapshotFile,
  resolveCheckpointDir,
  writeCheckpointMetadata,
  writeSnapshotFile,
} from './checkpoint-store.js'
import type {
  CheckpointFileRecord,
  CheckpointFileSnapshot,
  CheckpointMetadata,
  CheckpointTool,
} from './checkpoint-types.js'

export interface CreateCheckpointRequest {
  readonly workspaceRoot: string
  readonly sessionId: string
  readonly tool: CheckpointTool
  readonly files: readonly CheckpointFileSnapshot[]
  readonly reason?: string
}

/** Snapshots every touched file's pre-mutation state. Called with content already read before the write. */
export function createCheckpoint(request: CreateCheckpointRequest): CheckpointMetadata {
  if (request.files.length === 0) {
    throw new Error('createCheckpoint requires at least one touched file.')
  }

  const checkpointId = generateCheckpointId()
  const checkpointDir = resolveCheckpointDir(request.workspaceRoot, request.sessionId, checkpointId)

  const files: CheckpointFileRecord[] = request.files.map((file) => {
    if (file.originalContent === null) {
      return {
        targetPath: file.targetPath,
        existedBefore: false,
        originalHash: null,
        snapshotFile: null,
      }
    }

    const relativeSnapshotPath = path.relative(request.workspaceRoot, file.resolvedPath)
    writeSnapshotFile(checkpointDir, relativeSnapshotPath, file.originalContent)

    return {
      targetPath: file.targetPath,
      existedBefore: file.existedBefore,
      originalHash: sha256Hex(file.originalContent),
      snapshotFile: relativeSnapshotPath,
    }
  })

  const metadata: CheckpointMetadata = {
    checkpointId,
    sessionId: request.sessionId,
    tool: request.tool,
    createdAt: new Date().toISOString(),
    ...(request.reason !== undefined ? { reason: request.reason } : {}),
    files,
    restores: [],
  }

  writeCheckpointMetadata(checkpointDir, metadata)
  return metadata
}

export interface CheckpointSummary {
  readonly checkpointId: string
  readonly sessionId: string
  readonly tool: CheckpointTool
  readonly createdAt: string
  readonly fileCount: number
  readonly reason?: string
}

/** Lists checkpoints, newest first. Scoped to one session when `sessionId` is given, else every session. */
export function listCheckpoints(
  workspaceRoot: string,
  sessionId?: string,
): readonly CheckpointSummary[] {
  const sessionIds = sessionId !== undefined ? [sessionId] : listSessionIds(workspaceRoot)
  const summaries: CheckpointSummary[] = []

  for (const sid of sessionIds) {
    for (const checkpointId of listCheckpointIdsForSession(workspaceRoot, sid)) {
      const dir = resolveCheckpointDir(workspaceRoot, sid, checkpointId)
      const metadata = readCheckpointMetadata(dir)
      if (metadata === undefined) continue

      summaries.push({
        checkpointId: metadata.checkpointId,
        sessionId: metadata.sessionId,
        tool: metadata.tool,
        createdAt: metadata.createdAt,
        fileCount: metadata.files.length,
        ...(metadata.reason !== undefined ? { reason: metadata.reason } : {}),
      })
    }
  }

  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Full metadata for one checkpoint, found by id across every session. */
export function getCheckpoint(
  workspaceRoot: string,
  checkpointId: string,
): CheckpointMetadata | undefined {
  const found = findCheckpointDirById(workspaceRoot, checkpointId)
  if (found === undefined) return undefined
  return readCheckpointMetadata(found.checkpointDir)
}

export type CheckpointRestoreStatus = 'restored' | 'blocked' | 'not_found' | 'integrity_error'
export type CheckpointRestoreFileAction = 'restored' | 'deleted' | 'skipped_integrity_mismatch'

export interface CheckpointRestoreFileResult {
  readonly targetPath: string
  readonly action: CheckpointRestoreFileAction
  readonly restoredHash: string | null
}

/** Evidence-shaped result of one checkpoint restore attempt. */
export interface CheckpointRestoreEvidence {
  readonly tool: 'checkpoint_restore'
  readonly checkpointId: string
  readonly status: CheckpointRestoreStatus
  readonly files: readonly CheckpointRestoreFileResult[]
  readonly reason?: string
  readonly restoredAt: string
  readonly durationMs: number
  readonly auditTrace: readonly RuntimeAuditEvent[]
}

export interface RestoreCheckpointRequest {
  readonly workspaceRoot: string
  readonly checkpointId: string
  readonly policy: RuntimePolicySnapshot
  readonly approval?: RuntimeApproval
  readonly auditLog?: RuntimeAuditLog
}

/**
 * Restores every file in a checkpoint to its pre-mutation state — never a
 * global `git reset`, always file-by-file. Each snapshot's hash is verified
 * against the hash recorded at checkpoint time before it's written back; a
 * mismatch skips that file rather than overwriting blind (no destructive
 * restore without a verified hash). A file that didn't exist before the
 * original mutation is deleted, not overwritten with empty content.
 */
export function restoreCheckpoint(request: RestoreCheckpointRequest): CheckpointRestoreEvidence {
  const restoredAt = new Date().toISOString()
  const startedAtMs = Date.now()
  const action = `checkpoint_restore:${request.checkpointId}`
  const auditTrace: RuntimeAuditEvent[] = []

  const record = (event: RuntimeAuditEvent): void => {
    auditTrace.push(event)
    request.auditLog?.record(event)
  }

  const finish = (
    status: CheckpointRestoreStatus,
    files: readonly CheckpointRestoreFileResult[],
    reason?: string,
  ): CheckpointRestoreEvidence => ({
    tool: 'checkpoint_restore',
    checkpointId: request.checkpointId,
    status,
    files,
    ...(reason !== undefined ? { reason } : {}),
    restoredAt,
    durationMs: Date.now() - startedAtMs,
    auditTrace,
  })

  try {
    assertWriteApproved(request.policy, request.approval)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    record(createAuditEvent({ action, status: 'blocked', detail: message }))
    return finish('blocked', [], message)
  }

  const found = findCheckpointDirById(request.workspaceRoot, request.checkpointId)
  if (found === undefined) {
    const message = `Checkpoint not found: ${request.checkpointId}`
    record(createAuditEvent({ action, status: 'blocked', detail: message }))
    return finish('not_found', [], message)
  }

  const metadata = readCheckpointMetadata(found.checkpointDir)
  if (metadata === undefined) {
    const message = `Checkpoint metadata unreadable: ${request.checkpointId}`
    record(createAuditEvent({ action, status: 'blocked', detail: message }))
    return finish('not_found', [], message)
  }

  const fileResults: CheckpointRestoreFileResult[] = []
  const restoredFileHashes: Record<string, string | null> = {}
  let integrityFailure = false

  for (const fileRecord of metadata.files) {
    const resolvedPath = path.resolve(request.workspaceRoot, fileRecord.targetPath)

    if (!isPathInsideWorkspace(request.workspaceRoot, resolvedPath)) {
      integrityFailure = true
      fileResults.push({
        targetPath: fileRecord.targetPath,
        action: 'skipped_integrity_mismatch',
        restoredHash: null,
      })
      continue
    }

    if (!fileRecord.existedBefore) {
      deleteFileIfExists(resolvedPath)
      fileResults.push({ targetPath: fileRecord.targetPath, action: 'deleted', restoredHash: null })
      restoredFileHashes[fileRecord.targetPath] = null
      continue
    }

    if (fileRecord.snapshotFile === null || fileRecord.originalHash === null) {
      integrityFailure = true
      fileResults.push({
        targetPath: fileRecord.targetPath,
        action: 'skipped_integrity_mismatch',
        restoredHash: null,
      })
      continue
    }

    const snapshotContent = readSnapshotFile(found.checkpointDir, fileRecord.snapshotFile)
    const snapshotHash = sha256Hex(snapshotContent)

    if (snapshotHash !== fileRecord.originalHash) {
      integrityFailure = true
      fileResults.push({
        targetPath: fileRecord.targetPath,
        action: 'skipped_integrity_mismatch',
        restoredHash: null,
      })
      continue
    }

    atomicWriteFile(resolvedPath, snapshotContent)
    fileResults.push({
      targetPath: fileRecord.targetPath,
      action: 'restored',
      restoredHash: snapshotHash,
    })
    restoredFileHashes[fileRecord.targetPath] = snapshotHash
  }

  const updatedMetadata: CheckpointMetadata = {
    ...metadata,
    restores: [...metadata.restores, { restoredAt, restoredFileHashes }],
  }
  writeCheckpointMetadata(found.checkpointDir, updatedMetadata)

  const status: CheckpointRestoreStatus = integrityFailure ? 'integrity_error' : 'restored'

  record(
    createAuditEvent({
      action,
      status: 'allowed',
      detail:
        status === 'restored'
          ? `Restored ${fileResults.length} file(s) from checkpoint ${request.checkpointId}`
          : `Restore of checkpoint ${request.checkpointId} completed with integrity mismatches — some files were not restored`,
    }),
  )

  return finish(
    status,
    fileResults,
    integrityFailure
      ? 'One or more files failed snapshot hash verification and were not restored.'
      : undefined,
  )
}
