import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  renderCheckpointListCommand,
  renderCheckpointRestoreCommand,
  renderCheckpointShowCommand,
} from './cli-checkpoint.js'
import { editFileTool } from './runtime/tools/edit-file-tool.js'
import { createRuntimePolicyForMode } from './runtime/policy/runtime-policy.js'
import type { RuntimeToolContext } from './runtime/types.js'

describe('cli-checkpoint', () => {
  let workspaceDir: string

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'codemind-cli-checkpoint-'))
  })

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true })
  })

  async function editAFile(): Promise<void> {
    const filePath = join(workspaceDir, 'a.ts')
    writeFileSync(filePath, 'export const a = 1', 'utf-8')

    const context: RuntimeToolContext = {
      cwd: workspaceDir,
      policy: createRuntimePolicyForMode('APPROVED_EXECUTION'),
      sessionId: 'cm-cli-test',
    }
    await editFileTool.execute({ path: 'a.ts', oldText: 'a = 1', newText: 'a = 2' }, context)
  }

  describe('renderCheckpointListCommand', () => {
    it('reports no checkpoints when none exist', () => {
      expect(renderCheckpointListCommand([], workspaceDir)).toContain('No checkpoints found')
    })

    it('lists a real checkpoint created by a write tool', async () => {
      await editAFile()

      const output = renderCheckpointListCommand([], workspaceDir)
      expect(output).toContain('[edit_file]')
      expect(output).toContain('session=cm-cli-test')
      expect(output).toContain('files=1')
    })

    it('scopes to a session with --session', async () => {
      await editAFile()

      expect(renderCheckpointListCommand(['--session', 'cm-cli-test'], workspaceDir)).toContain(
        '[edit_file]',
      )
      expect(renderCheckpointListCommand(['--session', 'cm-other'], workspaceDir)).toContain(
        'No checkpoints found',
      )
    })

    it('supports --json output', async () => {
      await editAFile()

      const parsed = JSON.parse(renderCheckpointListCommand(['--json'], workspaceDir)) as unknown[]
      expect(parsed).toHaveLength(1)
    })
  })

  describe('renderCheckpointShowCommand', () => {
    it('throws when no id is given', () => {
      expect(() => renderCheckpointShowCommand([], workspaceDir)).toThrow(
        /Usage: codemind checkpoint show/,
      )
    })

    it('throws for an unknown checkpoint id', () => {
      expect(() => renderCheckpointShowCommand(['nonexistent'], workspaceDir)).toThrow(
        /Checkpoint not found/,
      )
    })

    it('shows a real checkpoint with its file hash', async () => {
      await editAFile()
      const [checkpoint] = JSON.parse(renderCheckpointListCommand(['--json'], workspaceDir)) as {
        checkpointId: string
      }[]

      const output = renderCheckpointShowCommand([checkpoint!.checkpointId], workspaceDir)
      expect(output).toContain('Tool:       edit_file')
      expect(output).toContain('a.ts')
      expect(output).toContain('hash=')
    })
  })

  describe('renderCheckpointRestoreCommand', () => {
    it('throws when no id is given', () => {
      expect(() => renderCheckpointRestoreCommand([], workspaceDir)).toThrow(
        /Usage: codemind checkpoint restore/,
      )
    })

    it('restores a real edit through the full CLI path', async () => {
      await editAFile()
      expect(readFileSync(join(workspaceDir, 'a.ts'), 'utf-8')).toBe('export const a = 2')

      const [checkpoint] = JSON.parse(renderCheckpointListCommand(['--json'], workspaceDir)) as {
        checkpointId: string
      }[]

      const output = renderCheckpointRestoreCommand([checkpoint!.checkpointId], workspaceDir)
      expect(output).toContain('Status:     restored')
      expect(readFileSync(join(workspaceDir, 'a.ts'), 'utf-8')).toBe('export const a = 1')
    })

    it('supports --json output', async () => {
      await editAFile()
      const [checkpoint] = JSON.parse(renderCheckpointListCommand(['--json'], workspaceDir)) as {
        checkpointId: string
      }[]

      const parsed = JSON.parse(
        renderCheckpointRestoreCommand([checkpoint!.checkpointId, '--json'], workspaceDir),
      ) as { status: string }
      expect(parsed.status).toBe('restored')
    })
  })
})
