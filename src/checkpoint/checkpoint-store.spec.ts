import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { CheckpointMetadata } from './checkpoint-types.js'
import {
  findCheckpointDirById,
  listCheckpointIdsForSession,
  listSessionIds,
  readCheckpointMetadata,
  readSnapshotFile,
  resolveCheckpointDir,
  resolveCheckpointsRoot,
  resolveSessionDir,
  writeCheckpointMetadata,
  writeSnapshotFile,
} from './checkpoint-store.js'

const SAMPLE_METADATA: CheckpointMetadata = {
  checkpointId: 'ckpt-1',
  sessionId: 'cm-1',
  tool: 'edit_file',
  createdAt: '2026-01-01T00:00:00.000Z',
  files: [{ targetPath: 'a.ts', existedBefore: true, originalHash: 'abc', snapshotFile: 'a.ts' }],
  restores: [],
}

describe('checkpoint-store', () => {
  let workspaceDir: string

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'symbolwright-checkpoint-store-'))
  })

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true })
  })

  it('resolves the expected .symbolwright/checkpoints/<session>/<checkpoint> layout', () => {
    expect(resolveCheckpointsRoot(workspaceDir)).toBe(
      join(workspaceDir, '.symbolwright', 'checkpoints'),
    )
    expect(resolveSessionDir(workspaceDir, 'cm-1')).toBe(
      join(workspaceDir, '.symbolwright', 'checkpoints', 'cm-1'),
    )
    expect(resolveCheckpointDir(workspaceDir, 'cm-1', 'ckpt-1')).toBe(
      join(workspaceDir, '.symbolwright', 'checkpoints', 'cm-1', 'ckpt-1'),
    )
  })

  it('round-trips checkpoint metadata', () => {
    const dir = resolveCheckpointDir(workspaceDir, 'cm-1', 'ckpt-1')
    writeCheckpointMetadata(dir, SAMPLE_METADATA)

    expect(readCheckpointMetadata(dir)).toEqual(SAMPLE_METADATA)
  })

  it('returns undefined for a missing or corrupt checkpoint.json', () => {
    const dir = resolveCheckpointDir(workspaceDir, 'cm-1', 'missing')
    expect(readCheckpointMetadata(dir)).toBeUndefined()
  })

  it('round-trips a nested file snapshot, mirroring directory structure', () => {
    const dir = resolveCheckpointDir(workspaceDir, 'cm-1', 'ckpt-1')
    writeSnapshotFile(dir, 'src/foo/bar.ts', 'original content')

    expect(readSnapshotFile(dir, 'src/foo/bar.ts')).toBe('original content')
  })

  it('lists session ids and checkpoint ids for a session', () => {
    writeCheckpointMetadata(resolveCheckpointDir(workspaceDir, 'cm-1', 'ckpt-1'), SAMPLE_METADATA)
    writeCheckpointMetadata(resolveCheckpointDir(workspaceDir, 'cm-1', 'ckpt-2'), {
      ...SAMPLE_METADATA,
      checkpointId: 'ckpt-2',
    })
    writeCheckpointMetadata(resolveCheckpointDir(workspaceDir, 'cm-2', 'ckpt-3'), {
      ...SAMPLE_METADATA,
      checkpointId: 'ckpt-3',
      sessionId: 'cm-2',
    })

    expect([...listSessionIds(workspaceDir)].sort()).toEqual(['cm-1', 'cm-2'])
    expect([...listCheckpointIdsForSession(workspaceDir, 'cm-1')].sort()).toEqual([
      'ckpt-1',
      'ckpt-2',
    ])
  })

  it('returns an empty array when no checkpoints exist', () => {
    expect(listSessionIds(workspaceDir)).toEqual([])
    expect(listCheckpointIdsForSession(workspaceDir, 'cm-1')).toEqual([])
  })

  it('finds a checkpoint by id across sessions', () => {
    writeCheckpointMetadata(resolveCheckpointDir(workspaceDir, 'cm-1', 'ckpt-1'), SAMPLE_METADATA)

    const found = findCheckpointDirById(workspaceDir, 'ckpt-1')
    expect(found?.sessionId).toBe('cm-1')
    expect(found?.checkpointDir).toBe(resolveCheckpointDir(workspaceDir, 'cm-1', 'ckpt-1'))
  })

  it('returns undefined when a checkpoint id does not exist anywhere', () => {
    expect(findCheckpointDirById(workspaceDir, 'nonexistent')).toBeUndefined()
  })
})
