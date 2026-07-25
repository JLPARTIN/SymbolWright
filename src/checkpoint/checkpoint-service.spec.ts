import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { RuntimeAuditLog } from '../runtime/audit/runtime-audit-log.js'
import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'
import {
  readCheckpointMetadata,
  resolveCheckpointDir,
  writeSnapshotFile,
} from './checkpoint-store.js'
import {
  createCheckpoint,
  getCheckpoint,
  listCheckpoints,
  restoreCheckpoint,
} from './checkpoint-service.js'
import type { CheckpointFileSnapshot } from './checkpoint-types.js'

const WRITABLE_POLICY = createRuntimePolicyForMode('APPROVED_EXECUTION')
const READ_ONLY_POLICY = createRuntimePolicyForMode('READ_ONLY')

describe('createCheckpoint', () => {
  let workspaceDir: string

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'symbolwright-checkpoint-service-'))
  })

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true })
  })

  it('snapshots an existing file with its hash and a real content copy', () => {
    const resolvedPath = join(workspaceDir, 'a.ts')
    const files: readonly CheckpointFileSnapshot[] = [
      { targetPath: 'a.ts', resolvedPath, existedBefore: true, originalContent: 'const a = 1' },
    ]

    const metadata = createCheckpoint({
      workspaceRoot: workspaceDir,
      sessionId: 'cm-test',
      tool: 'edit_file',
      files,
    })

    expect(metadata.files).toHaveLength(1)
    expect(metadata.files[0]?.existedBefore).toBe(true)
    expect(metadata.files[0]?.originalHash).toMatch(/^[0-9a-f]{64}$/)
    expect(metadata.files[0]?.snapshotFile).toBe('a.ts')

    const checkpointDir = resolveCheckpointDir(workspaceDir, 'cm-test', metadata.checkpointId)
    expect(readFileSync(join(checkpointDir, 'files', 'a.ts'), 'utf-8')).toBe('const a = 1')
    expect(readCheckpointMetadata(checkpointDir)).toEqual(metadata)
  })

  it('records a new file with no snapshot content (nothing existed to snapshot)', () => {
    const files: readonly CheckpointFileSnapshot[] = [
      {
        targetPath: 'new.ts',
        resolvedPath: join(workspaceDir, 'new.ts'),
        existedBefore: false,
        originalContent: null,
      },
    ]

    const metadata = createCheckpoint({
      workspaceRoot: workspaceDir,
      sessionId: 'cm-test',
      tool: 'local_file_write',
      files,
    })

    expect(metadata.files[0]).toEqual({
      targetPath: 'new.ts',
      existedBefore: false,
      originalHash: null,
      snapshotFile: null,
    })
  })

  it('snapshots multiple files for one apply_patch checkpoint', () => {
    const files: readonly CheckpointFileSnapshot[] = [
      {
        targetPath: 'a.ts',
        resolvedPath: join(workspaceDir, 'a.ts'),
        existedBefore: true,
        originalContent: 'a',
      },
      {
        targetPath: 'src/b.ts',
        resolvedPath: join(workspaceDir, 'src', 'b.ts'),
        existedBefore: true,
        originalContent: 'b',
      },
    ]

    const metadata = createCheckpoint({
      workspaceRoot: workspaceDir,
      sessionId: 'cm-test',
      tool: 'apply_patch',
      reason: 'refactor',
      files,
    })

    expect(metadata.files).toHaveLength(2)
    expect(metadata.reason).toBe('refactor')
  })

  it('throws when given no touched files', () => {
    expect(() =>
      createCheckpoint({
        workspaceRoot: workspaceDir,
        sessionId: 'cm-test',
        tool: 'edit_file',
        files: [],
      }),
    ).toThrow('at least one touched file')
  })
})

describe('listCheckpoints / getCheckpoint', () => {
  let workspaceDir: string

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'symbolwright-checkpoint-list-'))
  })

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true })
  })

  function makeCheckpoint(sessionId: string, targetPath: string) {
    return createCheckpoint({
      workspaceRoot: workspaceDir,
      sessionId,
      tool: 'edit_file',
      files: [
        {
          targetPath,
          resolvedPath: join(workspaceDir, targetPath),
          existedBefore: true,
          originalContent: 'x',
        },
      ],
    })
  }

  it('lists checkpoints across all sessions, newest first', async () => {
    const first = makeCheckpoint('cm-1', 'a.ts')
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = makeCheckpoint('cm-2', 'b.ts')

    const summaries = listCheckpoints(workspaceDir)
    expect(summaries.map((s) => s.checkpointId)).toEqual([second.checkpointId, first.checkpointId])
  })

  it('scopes to a single session when sessionId is given', () => {
    makeCheckpoint('cm-1', 'a.ts')
    makeCheckpoint('cm-2', 'b.ts')

    const summaries = listCheckpoints(workspaceDir, 'cm-1')
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.sessionId).toBe('cm-1')
  })

  it('returns an empty list when nothing exists', () => {
    expect(listCheckpoints(workspaceDir)).toEqual([])
  })

  it('getCheckpoint finds full metadata by id regardless of session', () => {
    const created = makeCheckpoint('cm-1', 'a.ts')
    const found = getCheckpoint(workspaceDir, created.checkpointId)
    expect(found).toEqual(created)
  })

  it('getCheckpoint returns undefined for an unknown id', () => {
    expect(getCheckpoint(workspaceDir, 'nonexistent')).toBeUndefined()
  })
})

describe('restoreCheckpoint', () => {
  let workspaceDir: string

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'symbolwright-checkpoint-restore-'))
  })

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true })
  })

  it('restores a modified file back to its original content', () => {
    const targetPath = 'a.ts'
    const resolvedPath = join(workspaceDir, targetPath)
    writeFileSync(resolvedPath, 'original content', 'utf-8')

    const metadata = createCheckpoint({
      workspaceRoot: workspaceDir,
      sessionId: 'cm-1',
      tool: 'edit_file',
      files: [
        { targetPath, resolvedPath, existedBefore: true, originalContent: 'original content' },
      ],
    })

    // Simulate the mutation that happened after the checkpoint was taken.
    writeFileSync(resolvedPath, 'mutated content', 'utf-8')

    const auditLog = new RuntimeAuditLog()
    const evidence = restoreCheckpoint({
      workspaceRoot: workspaceDir,
      checkpointId: metadata.checkpointId,
      policy: WRITABLE_POLICY,
      auditLog,
    })

    expect(evidence.status).toBe('restored')
    expect(evidence.files).toEqual([
      { targetPath, action: 'restored', restoredHash: expect.stringMatching(/^[0-9a-f]{64}$/) },
    ])
    expect(readFileSync(resolvedPath, 'utf-8')).toBe('original content')
    expect(evidence.auditTrace).toHaveLength(1)
    expect(evidence.auditTrace[0]?.status).toBe('allowed')
    expect(auditLog.list()).toHaveLength(1)

    // Restore is recorded on the checkpoint itself for auditability.
    const updated = getCheckpoint(workspaceDir, metadata.checkpointId)
    expect(updated?.restores).toHaveLength(1)
    expect(updated?.restores[0]?.restoredFileHashes[targetPath]).toMatch(/^[0-9a-f]{64}$/)
  })

  it('deletes a file that did not exist before the original mutation', () => {
    const targetPath = 'new.ts'
    const resolvedPath = join(workspaceDir, targetPath)

    const metadata = createCheckpoint({
      workspaceRoot: workspaceDir,
      sessionId: 'cm-1',
      tool: 'local_file_write',
      files: [{ targetPath, resolvedPath, existedBefore: false, originalContent: null }],
    })

    writeFileSync(resolvedPath, 'newly created content', 'utf-8')
    expect(existsSync(resolvedPath)).toBe(true)

    const evidence = restoreCheckpoint({
      workspaceRoot: workspaceDir,
      checkpointId: metadata.checkpointId,
      policy: WRITABLE_POLICY,
    })

    expect(evidence.status).toBe('restored')
    expect(evidence.files).toEqual([{ targetPath, action: 'deleted', restoredHash: null }])
    expect(existsSync(resolvedPath)).toBe(false)
  })

  it('restores multiple files from one apply_patch checkpoint', () => {
    const pathA = join(workspaceDir, 'a.ts')
    const pathB = join(workspaceDir, 'b.ts')
    writeFileSync(pathA, 'a-original', 'utf-8')
    writeFileSync(pathB, 'b-original', 'utf-8')

    const metadata = createCheckpoint({
      workspaceRoot: workspaceDir,
      sessionId: 'cm-1',
      tool: 'apply_patch',
      files: [
        {
          targetPath: 'a.ts',
          resolvedPath: pathA,
          existedBefore: true,
          originalContent: 'a-original',
        },
        {
          targetPath: 'b.ts',
          resolvedPath: pathB,
          existedBefore: true,
          originalContent: 'b-original',
        },
      ],
    })

    writeFileSync(pathA, 'a-mutated', 'utf-8')
    writeFileSync(pathB, 'b-mutated', 'utf-8')

    const evidence = restoreCheckpoint({
      workspaceRoot: workspaceDir,
      checkpointId: metadata.checkpointId,
      policy: WRITABLE_POLICY,
    })

    expect(evidence.status).toBe('restored')
    expect(readFileSync(pathA, 'utf-8')).toBe('a-original')
    expect(readFileSync(pathB, 'utf-8')).toBe('b-original')
  })

  it('blocks restore when policy disallows writes', () => {
    const resolvedPath = join(workspaceDir, 'a.ts')
    writeFileSync(resolvedPath, 'original', 'utf-8')
    const metadata = createCheckpoint({
      workspaceRoot: workspaceDir,
      sessionId: 'cm-1',
      tool: 'edit_file',
      files: [
        { targetPath: 'a.ts', resolvedPath, existedBefore: true, originalContent: 'original' },
      ],
    })

    writeFileSync(resolvedPath, 'mutated', 'utf-8')

    const evidence = restoreCheckpoint({
      workspaceRoot: workspaceDir,
      checkpointId: metadata.checkpointId,
      policy: READ_ONLY_POLICY,
    })

    expect(evidence.status).toBe('blocked')
    expect(readFileSync(resolvedPath, 'utf-8')).toBe('mutated') // untouched
  })

  it('returns not_found for an unknown checkpoint id', () => {
    const evidence = restoreCheckpoint({
      workspaceRoot: workspaceDir,
      checkpointId: 'nonexistent',
      policy: WRITABLE_POLICY,
    })

    expect(evidence.status).toBe('not_found')
  })

  it('refuses a destructive restore when the stored snapshot hash no longer matches (corruption)', () => {
    const resolvedPath = join(workspaceDir, 'a.ts')
    writeFileSync(resolvedPath, 'original', 'utf-8')
    const metadata = createCheckpoint({
      workspaceRoot: workspaceDir,
      sessionId: 'cm-1',
      tool: 'edit_file',
      files: [
        { targetPath: 'a.ts', resolvedPath, existedBefore: true, originalContent: 'original' },
      ],
    })

    // Corrupt the stored snapshot on disk after the fact.
    const checkpointDir = resolveCheckpointDir(workspaceDir, 'cm-1', metadata.checkpointId)
    writeSnapshotFile(checkpointDir, 'a.ts', 'tampered snapshot content')

    writeFileSync(resolvedPath, 'mutated', 'utf-8')

    const evidence = restoreCheckpoint({
      workspaceRoot: workspaceDir,
      checkpointId: metadata.checkpointId,
      policy: WRITABLE_POLICY,
    })

    expect(evidence.status).toBe('integrity_error')
    expect(evidence.files[0]?.action).toBe('skipped_integrity_mismatch')
    // The live file was left alone rather than overwritten with unverified content.
    expect(readFileSync(resolvedPath, 'utf-8')).toBe('mutated')
  })
})
