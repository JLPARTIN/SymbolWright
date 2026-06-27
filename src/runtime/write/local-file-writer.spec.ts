import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { executeLocalFileWrite } from './local-file-writer.js'
import { buildLocalFileWriteDiff, renderLocalFileWriteDiff } from './local-file-write-diff.js'
import { renderLocalFileWriteExecutionResult } from './local-file-write-result.js'
import { createLocalFileWriteExecutionAuditEvent } from './local-file-write-audit.js'
import { localFileWriteTool } from '../tools/local-file-write-tool.js'
import type { RuntimeApproval, RuntimePolicySnapshot, RuntimeToolContext } from '../types.js'

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
  mode: 'READ_ONLY',
  allowNetwork: false,
  allowShell: false,
  allowWrites: false,
  allowGitHubWrites: false,
  protectedPaths: [],
  noisyDirs: [],
}

const validApproval: RuntimeApproval = {
  ticketId: 'WRITE-TICKET-001',
  approvedBy: 'operator',
  scopes: ['file:write'],
}

const wrongScopeApproval: RuntimeApproval = {
  ticketId: 'WRITE-TICKET-002',
  approvedBy: 'operator',
  scopes: ['github:write'],
}

function makeTmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-writer-'))
}

function cleanupWorkspace(dir: string): void {
  fs.rmSync(dir, { recursive: true })
}

describe('executeLocalFileWrite', () => {
  it('blocks write when allowWrites is false', () => {
    const workspace = makeTmpWorkspace()
    try {
      const result = executeLocalFileWrite(
        { targetPath: 'test.txt', content: 'hello', reason: 'test', rollbackNote: 'delete test.txt', dryRun: false },
        workspace,
        readOnlyPolicy,
        validApproval,
      )
      expect(result.outcome).toBe('BLOCKED')
      expect(result.gateResult.decision).toBe('BLOCKED')
      expect(fs.existsSync(path.join(workspace, 'test.txt'))).toBe(false)
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('blocks write without approval', () => {
    const workspace = makeTmpWorkspace()
    try {
      const result = executeLocalFileWrite(
        { targetPath: 'test.txt', content: 'hello', reason: 'test', rollbackNote: 'delete', dryRun: false },
        workspace,
        writePolicy,
        undefined,
      )
      expect(result.outcome).toBe('BLOCKED')
      expect(fs.existsSync(path.join(workspace, 'test.txt'))).toBe(false)
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('blocks write without file:write scope', () => {
    const workspace = makeTmpWorkspace()
    try {
      const result = executeLocalFileWrite(
        { targetPath: 'test.txt', content: 'hello', reason: 'test', rollbackNote: 'delete', dryRun: false },
        workspace,
        writePolicy,
        wrongScopeApproval,
      )
      expect(result.outcome).toBe('BLOCKED')
      expect(fs.existsSync(path.join(workspace, 'test.txt'))).toBe(false)
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('blocks write outside workspace', () => {
    const workspace = makeTmpWorkspace()
    try {
      const result = executeLocalFileWrite(
        { targetPath: '../../etc/passwd', content: 'bad', reason: 'test', rollbackNote: 'undo', dryRun: false },
        workspace,
        writePolicy,
        validApproval,
      )
      expect(result.outcome).toBe('BLOCKED')
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('blocks write to protected path', () => {
    const workspace = makeTmpWorkspace()
    try {
      const result = executeLocalFileWrite(
        { targetPath: '.env', content: 'SECRET=x', reason: 'test', rollbackNote: 'undo', dryRun: false },
        workspace,
        writePolicy,
        validApproval,
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
        { targetPath: 'test.txt', content: 'hello', reason: 'test', rollbackNote: 'delete', dryRun: true },
        workspace,
        writePolicy,
        validApproval,
      )
      expect(result.outcome).toBe('DRY_RUN')
      expect(fs.existsSync(path.join(workspace, 'test.txt'))).toBe(false)
      expect(result.diff).not.toBeNull()
      expect(result.diff?.isNew).toBe(true)
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('dry-run shows previous content for existing file', () => {
    const workspace = makeTmpWorkspace()
    try {
      const targetFile = path.join(workspace, 'existing.txt')
      fs.writeFileSync(targetFile, 'original content')

      const result = executeLocalFileWrite(
        { targetPath: 'existing.txt', content: 'new content', reason: 'update', rollbackNote: 'revert', dryRun: true },
        workspace,
        writePolicy,
        validApproval,
      )
      expect(result.outcome).toBe('DRY_RUN')
      expect(result.diff?.previousContent).toBe('original content')
      expect(result.diff?.newContent).toBe('new content')
      expect(result.diff?.isNew).toBe(false)
      expect(fs.readFileSync(targetFile, 'utf8')).toBe('original content')
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('writes file when approved with dryRun false', () => {
    const workspace = makeTmpWorkspace()
    try {
      const result = executeLocalFileWrite(
        { targetPath: 'output.txt', content: 'written content', reason: 'create file', rollbackNote: 'delete output.txt', dryRun: false },
        workspace,
        writePolicy,
        validApproval,
      )
      expect(result.outcome).toBe('WRITTEN')
      expect(result.diff?.isNew).toBe(true)
      expect(fs.existsSync(path.join(workspace, 'output.txt'))).toBe(true)
      expect(fs.readFileSync(path.join(workspace, 'output.txt'), 'utf8')).toBe('written content')
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('preserves exact content when writing', () => {
    const workspace = makeTmpWorkspace()
    try {
      const content = 'line 1\nline 2\n\ttabbed\n'
      const result = executeLocalFileWrite(
        { targetPath: 'exact.txt', content, reason: 'test exact', rollbackNote: 'delete', dryRun: false },
        workspace,
        writePolicy,
        validApproval,
      )
      expect(result.outcome).toBe('WRITTEN')
      expect(fs.readFileSync(path.join(workspace, 'exact.txt'), 'utf8')).toBe(content)
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('creates parent directories when needed', () => {
    const workspace = makeTmpWorkspace()
    try {
      const result = executeLocalFileWrite(
        { targetPath: 'src/deep/nested/file.ts', content: 'export {}', reason: 'create nested', rollbackNote: 'remove dir', dryRun: false },
        workspace,
        writePolicy,
        validApproval,
      )
      expect(result.outcome).toBe('WRITTEN')
      expect(fs.existsSync(path.join(workspace, 'src/deep/nested/file.ts'))).toBe(true)
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('updates existing file and captures previous content', () => {
    const workspace = makeTmpWorkspace()
    try {
      const targetFile = path.join(workspace, 'update-me.txt')
      fs.writeFileSync(targetFile, 'old content')

      const result = executeLocalFileWrite(
        { targetPath: 'update-me.txt', content: 'new content', reason: 'update file', rollbackNote: 'restore old content', dryRun: false },
        workspace,
        writePolicy,
        validApproval,
      )
      expect(result.outcome).toBe('WRITTEN')
      expect(result.diff?.previousContent).toBe('old content')
      expect(result.diff?.newContent).toBe('new content')
      expect(result.diff?.isNew).toBe(false)
      expect(fs.readFileSync(targetFile, 'utf8')).toBe('new content')
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('requires reason', () => {
    const workspace = makeTmpWorkspace()
    try {
      const result = executeLocalFileWrite(
        { targetPath: 'test.txt', content: 'hello', reason: '', rollbackNote: 'delete', dryRun: false },
        workspace,
        writePolicy,
        validApproval,
      )
      expect(result.outcome).toBe('BLOCKED')
      expect(result.gateResult.blockReasons).toContain('Write request must include a reason.')
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('requires rollback note', () => {
    const workspace = makeTmpWorkspace()
    try {
      const result = executeLocalFileWrite(
        { targetPath: 'test.txt', content: 'hello', reason: 'test', rollbackNote: '', dryRun: false },
        workspace,
        writePolicy,
        validApproval,
      )
      expect(result.outcome).toBe('BLOCKED')
      expect(result.gateResult.blockReasons).toContain('Write request must include a rollback note.')
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('returns rollback note in result', () => {
    const workspace = makeTmpWorkspace()
    try {
      const result = executeLocalFileWrite(
        { targetPath: 'test.txt', content: 'hello', reason: 'test', rollbackNote: 'delete test.txt', dryRun: false },
        workspace,
        writePolicy,
        validApproval,
      )
      expect(result.rollbackNote).toBe('delete test.txt')
    } finally {
      cleanupWorkspace(workspace)
    }
  })
})

describe('buildLocalFileWriteDiff', () => {
  it('marks new file when previous is null', () => {
    const diff = buildLocalFileWriteDiff('test.txt', null, 'new content')
    expect(diff.isNew).toBe(true)
    expect(diff.previousContent).toBeNull()
    expect(diff.newContent).toBe('new content')
  })

  it('marks modified file when previous exists', () => {
    const diff = buildLocalFileWriteDiff('test.txt', 'old', 'new')
    expect(diff.isNew).toBe(false)
    expect(diff.previousContent).toBe('old')
    expect(diff.newContent).toBe('new')
  })
})

describe('renderLocalFileWriteDiff', () => {
  it('renders new file diff', () => {
    const diff = buildLocalFileWriteDiff('test.txt', null, 'hello')
    const output = renderLocalFileWriteDiff(diff)
    expect(output).toContain('File diff preview')
    expect(output).toContain('NEW FILE')
    expect(output).toContain('New content:')
    expect(output).toContain('hello')
  })

  it('renders modified file diff', () => {
    const diff = buildLocalFileWriteDiff('test.txt', 'old', 'new')
    const output = renderLocalFileWriteDiff(diff)
    expect(output).toContain('MODIFIED')
    expect(output).toContain('Previous content:')
    expect(output).toContain('old')
    expect(output).toContain('New content:')
    expect(output).toContain('new')
  })
})

describe('renderLocalFileWriteExecutionResult', () => {
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
    expect(output).toContain('File created')
  })

  it('renders dry-run result', () => {
    const output = renderLocalFileWriteExecutionResult({
      outcome: 'DRY_RUN',
      gateResult: {
        decision: 'ALLOWED',
        targetPath: 'test.txt',
        resolvedPath: '/workspace/test.txt',
        reason: 'test',
        rollbackNote: 'undo',
        dryRun: true,
        blockReasons: [],
      },
      diff: null,
      rollbackNote: 'undo',
      error: null,
    })
    expect(output).toContain('Outcome: DRY_RUN')
    expect(output).toContain('No file has been modified.')
  })

  it('renders blocked result', () => {
    const output = renderLocalFileWriteExecutionResult({
      outcome: 'BLOCKED',
      gateResult: {
        decision: 'BLOCKED',
        targetPath: '.env',
        resolvedPath: '/workspace/.env',
        reason: 'test',
        rollbackNote: 'undo',
        dryRun: false,
        blockReasons: ['Write actions are disabled by runtime policy.'],
      },
      diff: null,
      rollbackNote: 'undo',
      error: null,
    })
    expect(output).toContain('Outcome: BLOCKED')
    expect(output).toContain('Block reasons:')
    expect(output).toContain('- Write actions are disabled by runtime policy.')
  })

  it('renders error in result', () => {
    const output = renderLocalFileWriteExecutionResult({
      outcome: 'BLOCKED',
      gateResult: {
        decision: 'ALLOWED',
        targetPath: 'test.txt',
        resolvedPath: '/workspace/test.txt',
        reason: 'test',
        rollbackNote: 'undo',
        dryRun: false,
        blockReasons: [],
      },
      diff: null,
      rollbackNote: 'undo',
      error: 'EACCES: permission denied',
    })
    expect(output).toContain('Error: EACCES: permission denied')
  })
})

describe('createLocalFileWriteExecutionAuditEvent', () => {
  it('emits audit event for applied write', () => {
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
    expect(event.ticketId).toBe('WRITE-TICKET-001')
  })

  it('emits audit event for updated file', () => {
    const diff = buildLocalFileWriteDiff('test.txt', 'old', 'new')
    const event = createLocalFileWriteExecutionAuditEvent(
      {
        outcome: 'WRITTEN',
        gateResult: {
          decision: 'ALLOWED',
          targetPath: 'test.txt',
          resolvedPath: '/workspace/test.txt',
          reason: 'update file',
          rollbackNote: 'revert',
          dryRun: false,
          blockReasons: [],
        },
        diff,
        rollbackNote: 'revert',
        error: null,
      },
      validApproval,
    )
    expect(event.detail).toContain('Updated test.txt')
  })

  it('emits audit event for dry-run', () => {
    const event = createLocalFileWriteExecutionAuditEvent(
      {
        outcome: 'DRY_RUN',
        gateResult: {
          decision: 'ALLOWED',
          targetPath: 'test.txt',
          resolvedPath: '/workspace/test.txt',
          reason: 'test',
          rollbackNote: 'undo',
          dryRun: true,
          blockReasons: [],
        },
        diff: null,
        rollbackNote: 'undo',
        error: null,
      },
      validApproval,
    )
    expect(event.action).toBe('local_file_write_execution')
    expect(event.status).toBe('allowed')
    expect(event.detail).toContain('Dry-run write to test.txt')
  })

  it('emits audit event for blocked write', () => {
    const event = createLocalFileWriteExecutionAuditEvent(
      {
        outcome: 'BLOCKED',
        gateResult: {
          decision: 'BLOCKED',
          targetPath: '.env',
          resolvedPath: '/workspace/.env',
          reason: 'test',
          rollbackNote: 'undo',
          dryRun: false,
          blockReasons: ['Write actions are disabled by runtime policy.'],
        },
        diff: null,
        rollbackNote: 'undo',
        error: null,
      },
      undefined,
    )
    expect(event.action).toBe('local_file_write_execution')
    expect(event.status).toBe('blocked')
    expect(event.detail).toContain('blocked')
    expect(event.ticketId).toBeUndefined()
  })

  it('emits audit event for write error', () => {
    const event = createLocalFileWriteExecutionAuditEvent(
      {
        outcome: 'BLOCKED',
        gateResult: {
          decision: 'ALLOWED',
          targetPath: 'test.txt',
          resolvedPath: '/workspace/test.txt',
          reason: 'test',
          rollbackNote: 'undo',
          dryRun: false,
          blockReasons: [],
        },
        diff: null,
        rollbackNote: 'undo',
        error: 'EACCES: permission denied',
      },
      validApproval,
    )
    expect(event.status).toBe('blocked')
    expect(event.detail).toContain('failed')
    expect(event.detail).toContain('EACCES')
  })
})

describe('local file write tool with execution', () => {
  it('executes write when policy allows and dryRun is false', async () => {
    const workspace = makeTmpWorkspace()
    try {
      const context: RuntimeToolContext = {
        cwd: workspace,
        policy: writePolicy,
        approval: validApproval,
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
      expect(output).toContain('Write applied successfully.')
      expect(output).toContain('local_file_write_execution')
      expect(fs.existsSync(path.join(workspace, 'tool-output.txt'))).toBe(true)
      expect(fs.readFileSync(path.join(workspace, 'tool-output.txt'), 'utf8')).toBe('tool written')
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('returns gate-only output when dryRun is true even with writes allowed', async () => {
    const workspace = makeTmpWorkspace()
    try {
      const context: RuntimeToolContext = {
        cwd: workspace,
        policy: writePolicy,
        approval: validApproval,
      }

      const output = await localFileWriteTool.execute(
        {
          targetPath: 'dry-run.txt',
          content: 'should not write',
          reason: 'dry run test',
          rollbackNote: 'n/a',
          dryRun: true,
        },
        context,
      )

      expect(output).toContain('Decision: ALLOWED')
      expect(output).toContain('Dry-run preview: write would be allowed.')
      expect(fs.existsSync(path.join(workspace, 'dry-run.txt'))).toBe(false)
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('returns gate-only output when policy disallows writes', async () => {
    const workspace = makeTmpWorkspace()
    try {
      const context: RuntimeToolContext = {
        cwd: workspace,
        policy: readOnlyPolicy,
      }

      const output = await localFileWriteTool.execute(
        {
          targetPath: 'blocked.txt',
          content: 'should not write',
          reason: 'test',
          rollbackNote: 'delete',
          dryRun: false,
        },
        context,
      )

      expect(output).toContain('Decision: BLOCKED')
      expect(fs.existsSync(path.join(workspace, 'blocked.txt'))).toBe(false)
    } finally {
      cleanupWorkspace(workspace)
    }
  })

  it('includes diff preview in execution output', async () => {
    const workspace = makeTmpWorkspace()
    try {
      const context: RuntimeToolContext = {
        cwd: workspace,
        policy: writePolicy,
        approval: validApproval,
      }

      const output = await localFileWriteTool.execute(
        {
          targetPath: 'diffed.txt',
          content: 'diff content',
          reason: 'test diff',
          rollbackNote: 'delete',
          dryRun: false,
        },
        context,
      )

      expect(output).toContain('File diff preview')
      expect(output).toContain('NEW FILE')
      expect(output).toContain('diff content')
    } finally {
      cleanupWorkspace(workspace)
    }
  })
})
