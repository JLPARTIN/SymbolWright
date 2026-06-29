import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { SandboxFileWriter } from '../sandbox/sandbox-runner.js'
import { DockerSandboxFileWriter } from '../sandbox/sandbox-runner.js'
import { localFileWriteTool } from '../tools/local-file-write-tool.js'
import type { RuntimeApproval, RuntimePolicySnapshot, RuntimeToolContext } from '../types.js'
import { createLocalFileWriteExecutionAuditEvent } from './local-file-write-audit.js'
import { buildLocalFileWriteDiff, renderLocalFileWriteDiff } from './local-file-write-diff.js'
import { renderLocalFileWriteExecutionResult } from './local-file-write-result.js'
import { executeLocalFileWrite } from './local-file-writer.js'

const writePolicy: RuntimePolicySnapshot = {
  mode: 'APPROVED_EXECUTION',
  allowNetwork: false,
  allowShell: false,
  allowWrites: true,
  allowGitHubWrites: false,
  protectedPaths: ['.git', '.env', '.env.local', 'node_modules', 'dist', 'coverage'],
  noisyDirs: [],
}

const readOnlyPolicy: RuntimePolicySnapshot = {
  ...writePolicy,
  mode: 'READ_ONLY',
  allowWrites: false,
  protectedPaths: [],
}

const validApproval: RuntimeApproval = {
  ticketId: 'WRITE-TICKET-001',
  approvedBy: 'operator',
  scopes: ['file:write'],
}

const hostBackedSandboxWriter: SandboxFileWriter = {
  writeFile: (request) => {
    const target = path.resolve(request.workspaceRoot, request.targetPath)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, request.content, 'utf8')
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

const blockingSandboxWriter: SandboxFileWriter = {
  writeFile: (request) => ({
    outcome: 'BLOCKED',
    runner: 'docker',
    targetPath: request.targetPath,
    stdout: '',
    stderr: '',
    exitCode: null,
    reason: 'Sandbox unavailable',
  }),
}

function makeTmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-writer-'))
}

function cleanupWorkspace(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

describe('executeLocalFileWrite', () => {
  it('blocks write when allowWrites is false', () => {
    const workspace = makeTmpWorkspace()
    try {
      const result = executeLocalFileWrite(
        {
          targetPath: 'test.txt',
          content: 'hello',
          reason: 'test',
          rollbackNote: 'delete test.txt',
          dryRun: false,
        },
        workspace,
        readOnlyPolicy,
        validApproval,
        hostBackedSandboxWriter,
      )

      expect(result.outcome).toBe('BLOCKED')
      expect(fs.existsSync(path.join(workspace, 'test.txt'))).toBe(false)
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('writes through the sandbox file writer when policy allows writes', () => {
    const workspace = makeTmpWorkspace()
    try {
      const result = executeLocalFileWrite(
        {
          targetPath: 'direct.txt',
          content: 'direct write',
          reason: 'sandbox write regression',
          rollbackNote: 'delete direct.txt',
          dryRun: false,
        },
        workspace,
        writePolicy,
        undefined,
        hostBackedSandboxWriter,
      )

      expect(result.outcome).toBe('WRITTEN')
      expect(fs.readFileSync(path.join(workspace, 'direct.txt'), 'utf8')).toBe('direct write')
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('does not fall back to host writes when the sandbox writer blocks', () => {
    const workspace = makeTmpWorkspace()
    try {
      const result = executeLocalFileWrite(
        {
          targetPath: 'blocked.txt',
          content: 'blocked write',
          reason: 'sandbox fail closed regression',
          rollbackNote: 'delete blocked.txt',
          dryRun: false,
        },
        workspace,
        writePolicy,
        undefined,
        blockingSandboxWriter,
      )

      expect(result.outcome).toBe('BLOCKED')
      expect(result.error).toBe('Sandbox unavailable')
      expect(fs.existsSync(path.join(workspace, 'blocked.txt'))).toBe(false)
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('blocks write outside workspace before reaching the sandbox writer', () => {
    const workspace = makeTmpWorkspace()
    try {
      const result = executeLocalFileWrite(
        {
          targetPath: '../../outside.txt',
          content: 'bad',
          reason: 'test',
          rollbackNote: 'undo',
          dryRun: false,
        },
        workspace,
        writePolicy,
        validApproval,
        hostBackedSandboxWriter,
      )

      expect(result.outcome).toBe('BLOCKED')
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('blocks write to protected path before reaching the sandbox writer', () => {
    const workspace = makeTmpWorkspace()
    try {
      const result = executeLocalFileWrite(
        {
          targetPath: '.env',
          content: 'SECRET=x',
          reason: 'test',
          rollbackNote: 'undo',
          dryRun: false,
        },
        workspace,
        writePolicy,
        validApproval,
        hostBackedSandboxWriter,
      )

      expect(result.outcome).toBe('BLOCKED')
      expect(fs.existsSync(path.join(workspace, '.env'))).toBe(false)
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('dry-run never modifies file', () => {
    const workspace = makeTmpWorkspace()
    try {
      const result = executeLocalFileWrite(
        {
          targetPath: 'test.txt',
          content: 'hello',
          reason: 'test',
          rollbackNote: 'delete',
          dryRun: true,
        },
        workspace,
        writePolicy,
        validApproval,
        hostBackedSandboxWriter,
      )

      expect(result.outcome).toBe('DRY_RUN')
      expect(fs.existsSync(path.join(workspace, 'test.txt'))).toBe(false)
      expect(result.diff?.isNew).toBe(true)
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('default Docker writer fails closed when the sandbox binary is unavailable', () => {
    const workspace = makeTmpWorkspace()
    try {
      const result = executeLocalFileWrite(
        {
          targetPath: 'default-blocked.txt',
          content: 'blocked',
          reason: 'test unavailable Docker',
          rollbackNote: 'delete',
          dryRun: false,
        },
        workspace,
        writePolicy,
        validApproval,
        new DockerSandboxFileWriter({ dockerBinary: 'definitely-not-codemind-docker' }),
      )

      expect(result.outcome).toBe('BLOCKED')
      expect(result.error).toContain('host file writes are not allowed')
      expect(fs.existsSync(path.join(workspace, 'default-blocked.txt'))).toBe(false)
    } finally {
      cleanupWorkspace(workspace)
    }
  })
})

describe('rendering and audit helpers', () => {
  it('renders written result', () => {
    const diff = buildLocalFileWriteDiff('test.txt', null, 'hello')
    const output = renderLocalFileWriteExecutionResult({
      outcome: 'WRITTEN',
      gateResult: {
        decision: 'ALLOWED',
        targetPath: 'test.txt',
        resolvedPath: '/workspace/test.txt',
        reason: 'create file',
        rollbackNote: 'delete test.txt',
        dryRun: false,
        blockReasons: [],
      },
      diff,
      rollbackNote: 'delete test.txt',
      error: null,
    })

    expect(output).toContain('Outcome: WRITTEN')
    expect(output).toContain('Write applied successfully.')
  })

  it('renders new file diff', () => {
    const output = renderLocalFileWriteDiff(buildLocalFileWriteDiff('test.txt', null, 'hello'))

    expect(output).toContain('File diff preview')
    expect(output).toContain('NEW FILE')
  })

  it('emits audit event for sandbox-applied write', () => {
    const diff = buildLocalFileWriteDiff('test.txt', null, 'hello')
    const event = createLocalFileWriteExecutionAuditEvent(
      {
        outcome: 'WRITTEN',
        gateResult: {
          decision: 'ALLOWED',
          targetPath: 'test.txt',
          resolvedPath: '/workspace/test.txt',
          reason: 'create file',
          rollbackNote: 'delete',
          dryRun: false,
          blockReasons: [],
        },
        diff,
        rollbackNote: 'delete',
        error: null,
      },
      validApproval,
    )

    expect(event.action).toBe('local_file_write_execution')
    expect(event.status).toBe('allowed')
    expect(event.detail).toContain('Created test.txt')
  })
})

describe('local file write tool with sandbox execution', () => {
  it('executes write through an injected sandbox writer', async () => {
    const workspace = makeTmpWorkspace()
    try {
      const context: RuntimeToolContext = {
        cwd: workspace,
        policy: writePolicy,
        approval: validApproval,
        sandboxFileWriter: hostBackedSandboxWriter,
      }

      const output = await localFileWriteTool.execute(
        {
          targetPath: 'tool-output.txt',
          content: 'tool written',
          reason: 'test tool execution',
          rollbackNote: 'delete tool-output.txt',
          dryRun: false,
        },
        context,
      )

      expect(output).toContain('Outcome: WRITTEN')
      expect(output).toContain('local_file_write_execution')
      expect(fs.readFileSync(path.join(workspace, 'tool-output.txt'), 'utf8')).toBe('tool written')
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('returns gate-only output when dryRun is true', async () => {
    const workspace = makeTmpWorkspace()
    try {
      const output = await localFileWriteTool.execute(
        {
          targetPath: 'dry-run.txt',
          content: 'should not write',
          reason: 'dry run test',
          rollbackNote: 'n/a',
          dryRun: true,
        },
        { cwd: workspace, policy: writePolicy, sandboxFileWriter: hostBackedSandboxWriter },
      )

      expect(output).toContain('Decision: ALLOWED')
      expect(output).toContain('Dry-run preview: write would be allowed.')
      expect(fs.existsSync(path.join(workspace, 'dry-run.txt'))).toBe(false)
    } finally {
      cleanupWorkspace(workspace)
    }
  })
})
