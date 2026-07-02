/** The three write-capable tools that must snapshot before mutating. */
export type CheckpointTool = 'edit_file' | 'local_file_write' | 'apply_patch'

/** A file's pre-mutation state, captured before a write is applied. */
export interface CheckpointFileSnapshot {
  readonly targetPath: string
  readonly resolvedPath: string
  readonly existedBefore: boolean
  readonly originalContent: string | null
}

/** Persisted record of one file within checkpoint.json — no raw content, just hashes + a pointer. */
export interface CheckpointFileRecord {
  readonly targetPath: string
  readonly existedBefore: boolean
  readonly originalHash: string | null
  /** Relative path under `<checkpointDir>/files/` holding the original content, or null if the file didn't exist. */
  readonly snapshotFile: string | null
}

/** One restore attempt against a checkpoint — appended, never overwritten, so history isn't lost. */
export interface CheckpointRestoreRecord {
  readonly restoredAt: string
  readonly restoredFileHashes: Readonly<Record<string, string | null>>
}

export interface CheckpointMetadata {
  readonly checkpointId: string
  readonly sessionId: string
  readonly tool: CheckpointTool
  readonly createdAt: string
  readonly reason?: string
  readonly files: readonly CheckpointFileRecord[]
  readonly restores: readonly CheckpointRestoreRecord[]
}
