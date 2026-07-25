import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { editFileTool } from '../runtime/tools/edit-file-tool.js'
import { localFileWriteTool } from '../runtime/tools/local-file-write-tool.js'
import { applyPatchTool } from '../runtime/tools/apply-patch-tool.js'
import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'
import type { SandboxFileWriter } from '../runtime/sandbox/sandbox-runner.js'
import type { RuntimeToolContext } from '../runtime/types.js'
import { getCheckpoint, listCheckpoints, restoreCheckpoint } from './checkpoint-service.js'

// executeLocalFileWrite defaults to a Docker-backed sandbox writer, which
// isn't available in this test environment — write straight to the host
// filesystem instead, exactly like local-file-writer.spec.ts does.
const hostBackedSandboxWriter: SandboxFileWriter = {
  writeFile: (request) => {
    const target = resolve(request.workspaceRoot, request.targetPath)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, request.content, 'utf8')
    return {
      outcome: 'WRITTEN',
      runner: 'docker',
      targetPath: request.targetPath,
      stdout: '',
      stderr: '',
      exitCode: 0,
      reason: null,
    }
  },
}

describe('checkpointing is mandatory before every mutating write tool', () => {
  let workspaceDir: string
  let context: RuntimeToolContext

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'symbolwright-checkpoint-integration-'))
    context = {
      cwd: workspaceDir,
      policy: createRuntimePolicyForMode('APPROVED_EXECUTION'),
      sessionId: 'cm-integration-test',
      sandboxFileWriter: hostBackedSandboxWriter,
    }
  })

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true })
  })

  it('edit_file: checkpoints before the edit, and restoring undoes it', async () => {
    const filePath = join(workspaceDir, 'hello.ts')
    writeFileSync(filePath, 'export const greeting = "Hello"', 'utf-8')

    await editFileTool.execute({ path: 'hello.ts', oldText: '"Hello"', newText: '"Hi"' }, context)

    expect(readFileSync(filePath, 'utf-8')).toContain('"Hi"')

    const checkpoints = listCheckpoints(workspaceDir, 'cm-integration-test')
    expect(checkpoints).toHaveLength(1)
    expect(checkpoints[0]?.tool).toBe('edit_file')

    const metadata = getCheckpoint(workspaceDir, checkpoints[0]!.checkpointId)
    expect(metadata?.files[0]?.originalHash).toBeTruthy()

    const restore = restoreCheckpoint({
      workspaceRoot: workspaceDir,
      checkpointId: checkpoints[0]!.checkpointId,
      policy: context.policy,
    })

    expect(restore.status).toBe('restored')
    expect(readFileSync(filePath, 'utf-8')).toBe('export const greeting = "Hello"')
  })

  it('local_file_write: checkpoints an overwrite of an existing file and restores it', async () => {
    const filePath = join(workspaceDir, 'config.json')
    writeFileSync(filePath, '{"version":1}', 'utf-8')

    await localFileWriteTool.execute(
      {
        targetPath: 'config.json',
        content: '{"version":2}',
        reason: 'bump version',
        rollbackNote: 'revert version bump',
        dryRun: false,
      },
      context,
    )

    expect(readFileSync(filePath, 'utf-8')).toBe('{"version":2}')

    const checkpoints = listCheckpoints(workspaceDir, 'cm-integration-test')
    expect(checkpoints).toHaveLength(1)
    expect(checkpoints[0]?.tool).toBe('local_file_write')

    const restore = restoreCheckpoint({
      workspaceRoot: workspaceDir,
      checkpointId: checkpoints[0]!.checkpointId,
      policy: context.policy,
    })

    expect(restore.status).toBe('restored')
    expect(readFileSync(filePath, 'utf-8')).toBe('{"version":1}')
  })

  it('local_file_write: checkpoints a brand-new file, and restoring deletes it', async () => {
    const filePath = join(workspaceDir, 'new-file.ts')

    await localFileWriteTool.execute(
      {
        targetPath: 'new-file.ts',
        content: 'export const x = 1',
        reason: 'create file',
        rollbackNote: 'delete it',
        dryRun: false,
      },
      context,
    )

    expect(existsSync(filePath)).toBe(true)

    const checkpoints = listCheckpoints(workspaceDir, 'cm-integration-test')
    const restore = restoreCheckpoint({
      workspaceRoot: workspaceDir,
      checkpointId: checkpoints[0]!.checkpointId,
      policy: context.policy,
    })

    expect(restore.status).toBe('restored')
    expect(restore.files[0]?.action).toBe('deleted')
    expect(existsSync(filePath)).toBe(false)
  })

  it('local_file_write: does not checkpoint a dry run (nothing was mutated)', async () => {
    writeFileSync(join(workspaceDir, 'config.json'), '{"version":1}', 'utf-8')

    await localFileWriteTool.execute(
      {
        targetPath: 'config.json',
        content: '{"version":2}',
        reason: 'preview',
        rollbackNote: 'n/a',
        dryRun: true,
      },
      context,
    )

    expect(listCheckpoints(workspaceDir, 'cm-integration-test')).toEqual([])
  })

  it('apply_patch: one checkpoint covers every file in a multi-file patch, and restore recovers all of them', async () => {
    writeFileSync(join(workspaceDir, 'a.ts'), 'export const a = 1', 'utf-8')
    writeFileSync(join(workspaceDir, 'b.ts'), 'export const b = 2', 'utf-8')

    await applyPatchTool.execute(
      {
        reason: 'refactor exports',
        rollbackNote: 'revert refactor',
        dryRun: false,
        files: [
          { targetPath: 'a.ts', content: 'export const a = 100' },
          { targetPath: 'b.ts', content: 'export const b = 200' },
        ],
      },
      context,
    )

    expect(readFileSync(join(workspaceDir, 'a.ts'), 'utf-8')).toBe('export const a = 100')
    expect(readFileSync(join(workspaceDir, 'b.ts'), 'utf-8')).toBe('export const b = 200')

    const checkpoints = listCheckpoints(workspaceDir, 'cm-integration-test')
    expect(checkpoints).toHaveLength(1)
    expect(checkpoints[0]?.tool).toBe('apply_patch')
    expect(checkpoints[0]?.fileCount).toBe(2)

    const restore = restoreCheckpoint({
      workspaceRoot: workspaceDir,
      checkpointId: checkpoints[0]!.checkpointId,
      policy: context.policy,
    })

    expect(restore.status).toBe('restored')
    expect(readFileSync(join(workspaceDir, 'a.ts'), 'utf-8')).toBe('export const a = 1')
    expect(readFileSync(join(workspaceDir, 'b.ts'), 'utf-8')).toBe('export const b = 2')
  })

  it('mints a real session id when the context has none, rather than skipping checkpointing', async () => {
    const filePath = join(workspaceDir, 'hello.ts')
    writeFileSync(filePath, 'export const x = 1', 'utf-8')

    const contextWithoutSessionId: RuntimeToolContext = {
      cwd: workspaceDir,
      policy: createRuntimePolicyForMode('APPROVED_EXECUTION'),
    }

    await editFileTool.execute(
      { path: 'hello.ts', oldText: 'x = 1', newText: 'x = 2' },
      contextWithoutSessionId,
    )

    const checkpoints = listCheckpoints(workspaceDir)
    expect(checkpoints).toHaveLength(1)
    expect(checkpoints[0]?.sessionId).toMatch(/^cm-\d+-[0-9a-f]{8}$/)
  })
})
