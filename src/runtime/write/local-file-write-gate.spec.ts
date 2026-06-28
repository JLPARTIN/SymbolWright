import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  evaluateLocalFileWriteGate,
  renderLocalFileWriteGateResult,
  type LocalFileWriteRequest,
} from './local-file-write-gate.js'
import { createLocalFileWriteAuditEvent } from './local-file-write-audit.js'
import { localFileWriteTool } from '../tools/local-file-write-tool.js'
import { createFixtureRegistry } from '../registry/fixture-registry-factory.js'
import type { RuntimeApproval, RuntimePolicySnapshot, RuntimeToolContext } from '../types.js'
import { renderRuntimeLocalWrite } from '../../cli-runtime-local-write.js'
import { createDefaultRuntimePolicy } from '../policy/runtime-policy.js'

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

const legacyApproval: RuntimeApproval = {
  ticketId: 'WRITE-TICKET-001',
  approvedBy: 'operator',
  scopes: ['file:write'],
}

function makeRequest(overrides: Partial<LocalFileWriteRequest> = {}): LocalFileWriteRequest {
  return {
    targetPath: overrides.targetPath ?? 'src/cli.ts',
    content: overrides.content ?? 'console.log("hello")',
    reason: overrides.reason ?? 'Add logging',
    rollbackNote: overrides.rollbackNote ?? 'Remove the log line',
    dryRun: overrides.dryRun ?? true,
  }
}

const testContext: RuntimeToolContext = {
  cwd: '/test/workspace',
  policy: readOnlyPolicy,
}

describe('local file write gate', () => {
  it('allows write with valid policy and no approval ticket', () => {
    const request = makeRequest()
    const result = evaluateLocalFileWriteGate(request, '/test/workspace', writePolicy, undefined)

    expect(result.decision).toBe('ALLOWED')
    expect(result.blockReasons).toHaveLength(0)
    expect(result.targetPath).toBe('src/cli.ts')
    expect(result.dryRun).toBe(true)
  })

  it('ignores legacy approval data when policy allows writes', () => {
    const request = makeRequest()
    const result = evaluateLocalFileWriteGate(request, '/test/workspace', writePolicy, legacyApproval)

    expect(result.decision).toBe('ALLOWED')
    expect(result.blockReasons).toHaveLength(0)
  })

  it('blocks when writes are disabled by policy', () => {
    const request = makeRequest()
    const result = evaluateLocalFileWriteGate(request, '/test/workspace', readOnlyPolicy, undefined)

    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Write actions are disabled by runtime policy.')
  })

  it('blocks when target path is outside workspace', () => {
    const request = makeRequest({ targetPath: '../../etc/passwd' })
    const result = evaluateLocalFileWriteGate(request, '/test/workspace', writePolicy, undefined)

    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons.some((r) => r.includes('outside workspace'))).toBe(true)
  })

  it('blocks when target path is protected .env', () => {
    const request = makeRequest({ targetPath: '.env' })
    const result = evaluateLocalFileWriteGate(request, '/test/workspace', writePolicy, undefined)

    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons.some((r) => r.includes('protected'))).toBe(true)
  })

  it('blocks when target path is in node_modules', () => {
    const request = makeRequest({ targetPath: 'node_modules/pkg/index.js' })
    const result = evaluateLocalFileWriteGate(request, '/test/workspace', writePolicy, undefined)

    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons.some((r) => r.includes('protected'))).toBe(true)
  })

  it('blocks when target path is in .git', () => {
    const request = makeRequest({ targetPath: '.git/config' })
    const result = evaluateLocalFileWriteGate(request, '/test/workspace', writePolicy, undefined)

    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons.some((r) => r.includes('protected'))).toBe(true)
  })

  it('blocks when reason is empty', () => {
    const request = makeRequest({ reason: '' })
    const result = evaluateLocalFileWriteGate(request, '/test/workspace', writePolicy, undefined)

    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Write request must include a reason.')
  })

  it('blocks when rollback note is empty', () => {
    const request = makeRequest({ rollbackNote: '' })
    const result = evaluateLocalFileWriteGate(request, '/test/workspace', writePolicy, undefined)

    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Write request must include a rollback note.')
  })

  it('accumulates multiple block reasons', () => {
    const request = makeRequest({ reason: '', rollbackNote: '', targetPath: '../../etc/passwd' })
    const result = evaluateLocalFileWriteGate(request, '/test/workspace', readOnlyPolicy, undefined)

    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons.length).toBeGreaterThanOrEqual(4)
  })

  it('returns resolved path', () => {
    const request = makeRequest({ targetPath: 'src/cli.ts' })
    const result = evaluateLocalFileWriteGate(request, '/test/workspace', writePolicy, undefined)

    expect(result.resolvedPath).toBe(path.resolve('/test/workspace', 'src/cli.ts'))
  })

  it('preserves reason and rollback note in result', () => {
    const request = makeRequest({ reason: 'Fix bug', rollbackNote: 'Revert fix' })
    const result = evaluateLocalFileWriteGate(request, '/test/workspace', writePolicy, undefined)

    expect(result.reason).toBe('Fix bug')
    expect(result.rollbackNote).toBe('Revert fix')
  })
})

describe('local file write gate renderer', () => {
  it('renders allowed result with dry-run', () => {
    const request = makeRequest({ dryRun: true })
    const result = evaluateLocalFileWriteGate(request, '/test/workspace', writePolicy, undefined)
    const output = renderLocalFileWriteGateResult(result)

    expect(output).toContain('CodeMind local file write gate')
    expect(output).toContain('Decision: ALLOWED')
    expect(output).toContain('Dry run: yes')
    expect(output).toContain('Dry-run preview: write would be allowed.')
    expect(output).toContain('No file has been modified.')
  })

  it('renders allowed result without dry-run', () => {
    const request = makeRequest({ dryRun: false })
    const result = evaluateLocalFileWriteGate(request, '/test/workspace', writePolicy, undefined)
    const output = renderLocalFileWriteGateResult(result)

    expect(output).toContain('Decision: ALLOWED')
    expect(output).toContain('Dry run: no')
    expect(output).toContain('Write is allowed by runtime policy.')
  })

  it('renders blocked result with block reasons', () => {
    const request = makeRequest()
    const result = evaluateLocalFileWriteGate(request, '/test/workspace', readOnlyPolicy, undefined)
    const output = renderLocalFileWriteGateResult(result)

    expect(output).toContain('Decision: BLOCKED')
    expect(output).toContain('Block reasons:')
    expect(output).toContain('- Write actions are disabled by runtime policy.')
  })

  it('renders target path and reason', () => {
    const request = makeRequest({ targetPath: 'src/app.ts', reason: 'Update app' })
    const result = evaluateLocalFileWriteGate(request, '/test/workspace', writePolicy, undefined)
    const output = renderLocalFileWriteGateResult(result)

    expect(output).toContain('Target: src/app.ts')
    expect(output).toContain('Reason: Update app')
  })

  it('renders rollback note', () => {
    const request = makeRequest({ rollbackNote: 'Undo change' })
    const result = evaluateLocalFileWriteGate(request, '/test/workspace', writePolicy, undefined)
    const output = renderLocalFileWriteGateResult(result)

    expect(output).toContain('Rollback: Undo change')
  })
})

describe('local file write audit', () => {
  it('creates allowed audit event without approval', () => {
    const request = makeRequest({ dryRun: false })
    const result = evaluateLocalFileWriteGate(request, '/test/workspace', writePolicy, undefined)
    const event = createLocalFileWriteAuditEvent(result, undefined)

    expect(event.action).toBe('local_file_write')
    expect(event.status).toBe('allowed')
    expect(event.detail).toContain('Write to src/cli.ts')
  })

  it('continues to render legacy approval data when supplied', () => {
    const request = makeRequest({ dryRun: true })
    const result = evaluateLocalFileWriteGate(request, '/test/workspace', writePolicy, legacyApproval)
    const event = createLocalFileWriteAuditEvent(result, legacyApproval)

    expect(event.action).toBe('local_file_write')
    expect(event.status).toBe('allowed')
    expect(event.detail).toContain('Dry-run write to src/cli.ts')
  })

  it('creates blocked audit event', () => {
    const request = makeRequest()
    const result = evaluateLocalFileWriteGate(request, '/test/workspace', readOnlyPolicy, undefined)
    const event = createLocalFileWriteAuditEvent(result, undefined)

    expect(event.action).toBe('local_file_write')
    expect(event.status).toBe('blocked')
    expect(event.detail).toContain('blocked')
  })
})

describe('local file write tool', () => {
  it('has correct tool metadata', () => {
    expect(localFileWriteTool.name).toBe('local_file_write')
    expect(localFileWriteTool.capability).toBe('LOCAL_FILE_WRITE')
  })

  it('returns blocked output when policy disables writes', async () => {
    const output = await localFileWriteTool.execute(
      {
        targetPath: 'src/cli.ts',
        content: 'test content',
        reason: 'Add feature',
        rollbackNote: 'Revert feature',
        dryRun: true,
      },
      testContext,
    )

    expect(output).toContain('CodeMind local file write gate')
    expect(output).toContain('Decision: BLOCKED')
  })

  it('writes by default when dryRun is omitted', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-write-tool-'))
    const context: RuntimeToolContext = { cwd: tmpDir, policy: createDefaultRuntimePolicy() }

    try {
      const output = await localFileWriteTool.execute(
        {
          targetPath: 'src/generated.ts',
          content: 'export const generated = true\n',
          reason: 'Generate file',
          rollbackNote: 'Delete file',
        },
        context,
      )

      expect(output).toContain('Outcome: WRITTEN')
      expect(fs.readFileSync(path.join(tmpDir, 'src', 'generated.ts'), 'utf8')).toContain(
        'generated = true',
      )
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('rejects missing input', async () => {
    await expect(localFileWriteTool.execute(null, testContext)).rejects.toThrow(
      'Missing local file write input',
    )
  })

  it('rejects missing targetPath', async () => {
    await expect(
      localFileWriteTool.execute(
        { targetPath: '', content: 'x', reason: 'y', rollbackNote: 'z' },
        testContext,
      ),
    ).rejects.toThrow('Missing targetPath')
  })

  it('rejects missing reason', async () => {
    await expect(
      localFileWriteTool.execute(
        { targetPath: 'x.ts', content: 'x', reason: '', rollbackNote: 'z' },
        testContext,
      ),
    ).rejects.toThrow('Missing reason')
  })

  it('rejects missing rollbackNote', async () => {
    await expect(
      localFileWriteTool.execute(
        { targetPath: 'x.ts', content: 'x', reason: 'y', rollbackNote: '' },
        testContext,
      ),
    ).rejects.toThrow('Missing rollbackNote')
  })

  it('rejects missing content', async () => {
    await expect(
      localFileWriteTool.execute({ targetPath: 'x.ts', reason: 'y', rollbackNote: 'z' }, testContext),
    ).rejects.toThrow('Missing content')
  })

  it('shows explicit dryRun previews', async () => {
    const output = await localFileWriteTool.execute(
      {
        targetPath: 'src/cli.ts',
        content: 'test',
        reason: 'Add feature',
        rollbackNote: 'Revert',
        dryRun: true,
      },
      { cwd: '/test/workspace', policy: writePolicy },
    )

    expect(output).toContain('Dry run: yes')
  })

  it('shows blocked for protected path', async () => {
    const output = await localFileWriteTool.execute(
      {
        targetPath: '.env',
        content: 'SECRET=x',
        reason: 'Add secret',
        rollbackNote: 'Remove secret',
        dryRun: true,
      },
      testContext,
    )

    expect(output).toContain('BLOCKED')
  })
})

describe('local write registry', () => {
  it('includes local_file_write tool', () => {
    const registry = createFixtureRegistry('local_write')

    expect(registry.has('local_file_write')).toBe(true)
    const tool = registry.getOrThrow('local_file_write')
    expect(tool.name).toBe('local_file_write')
  })

  it('inherits all Phase K tools', () => {
    const registry = createFixtureRegistry('local_write')

    expect(registry.has('write_intent_plan')).toBe(true)
    expect(registry.has('operator_review_packet')).toBe(true)
    expect(registry.has('ajna_live_read_review')).toBe(true)
    expect(registry.has('github_live_read_pr')).toBe(true)
  })
})

describe('CLI local write', () => {
  it('renders and applies local file write from fixture file', async () => {
    const fixture = {
      targetPath: 'src/cli.ts',
      content: 'console.log("hello")',
      reason: 'Add logging',
      rollbackNote: 'Remove log line',
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-write-'))
    const fixturePath = path.join(tmpDir, 'local-write-fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    try {
      const output = await renderRuntimeLocalWrite(fixturePath, tmpDir)

      expect(output).toContain('CodeMind local file write execution')
      expect(output).toContain('Target: src/cli.ts')
      expect(fs.readFileSync(path.join(tmpDir, 'src', 'cli.ts'), 'utf8')).toContain(
        'console.log("hello")',
      )
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('shows BLOCKED for protected path fixture', async () => {
    const fixture = {
      targetPath: '.env',
      content: 'SECRET=value',
      reason: 'Add env var',
      rollbackNote: 'Remove env var',
      dryRun: true,
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-write-'))
    const fixturePath = path.join(tmpDir, 'local-write-fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    try {
      const output = await renderRuntimeLocalWrite(fixturePath, tmpDir)

      expect(output).toContain('BLOCKED')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('throws on missing targetPath', async () => {
    const fixture = { content: 'x', reason: 'test', rollbackNote: 'test' }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-write-'))
    const fixturePath = path.join(tmpDir, 'bad-fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    try {
      await expect(renderRuntimeLocalWrite(fixturePath, tmpDir)).rejects.toThrow(
        'non-empty "targetPath"',
      )
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('throws on missing reason', async () => {
    const fixture = { targetPath: 'x.ts', content: 'x', rollbackNote: 'test' }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-write-'))
    const fixturePath = path.join(tmpDir, 'bad-fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    try {
      await expect(renderRuntimeLocalWrite(fixturePath, tmpDir)).rejects.toThrow('non-empty "reason"')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
