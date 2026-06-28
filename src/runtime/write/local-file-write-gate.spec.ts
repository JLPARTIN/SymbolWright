import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { renderRuntimeLocalWrite } from '../../cli-runtime-local-write.js'
import { createDefaultRuntimePolicy } from '../policy/runtime-policy.js'
import { createFixtureRegistry } from '../registry/fixture-registry-factory.js'
import { localFileWriteTool } from '../tools/local-file-write-tool.js'
import type { RuntimeApproval, RuntimePolicySnapshot, RuntimeToolContext } from '../types.js'
import { createLocalFileWriteAuditEvent } from './local-file-write-audit.js'
import {
  evaluateLocalFileWriteGate,
  renderLocalFileWriteGateResult,
  type LocalFileWriteRequest,
} from './local-file-write-gate.js'

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

const blockedContext: RuntimeToolContext = {
  cwd: '/test/workspace',
  policy: readOnlyPolicy,
}

describe('local file write gate', () => {
  it('allows valid writes without approval tickets when policy allows writes', () => {
    const result = evaluateLocalFileWriteGate(
      makeRequest(),
      '/test/workspace',
      writePolicy,
      undefined,
    )

    expect(result.decision).toBe('ALLOWED')
    expect(result.blockReasons).toHaveLength(0)
  })

  it('ignores legacy approval data when policy allows writes', () => {
    const result = evaluateLocalFileWriteGate(
      makeRequest(),
      '/test/workspace',
      writePolicy,
      legacyApproval,
    )

    expect(result.decision).toBe('ALLOWED')
    expect(result.blockReasons).toHaveLength(0)
  })

  it('blocks when writes are disabled by policy', () => {
    const result = evaluateLocalFileWriteGate(
      makeRequest(),
      '/test/workspace',
      readOnlyPolicy,
      undefined,
    )

    expect(result.decision).toBe('BLOCKED')
    expect(result.blockReasons).toContain('Write actions are disabled by runtime policy.')
  })

  it('blocks protected targets and missing request notes', () => {
    const protectedPath = evaluateLocalFileWriteGate(
      makeRequest({ targetPath: '.env', reason: '', rollbackNote: '' }),
      '/test/workspace',
      writePolicy,
      undefined,
    )

    expect(protectedPath.decision).toBe('BLOCKED')
    expect(protectedPath.blockReasons.some((reason) => reason.includes('protected'))).toBe(true)
    expect(protectedPath.blockReasons).toContain('Write request must include a reason.')
    expect(protectedPath.blockReasons).toContain('Write request must include a rollback note.')
  })
})

describe('local file write gate renderer and audit', () => {
  it('renders dry-run preview and allowed audit events', () => {
    const result = evaluateLocalFileWriteGate(
      makeRequest({ dryRun: true }),
      '/test/workspace',
      writePolicy,
    )
    const output = renderLocalFileWriteGateResult(result)
    const event = createLocalFileWriteAuditEvent(result, undefined)

    expect(output).toContain('Decision: ALLOWED')
    expect(output).toContain('Dry-run preview: write would be allowed.')
    expect(event.status).toBe('allowed')
  })

  it('can preserve legacy ticket metadata when supplied', () => {
    const result = evaluateLocalFileWriteGate(
      makeRequest({ dryRun: true }),
      '/test/workspace',
      writePolicy,
      legacyApproval,
    )
    const event = createLocalFileWriteAuditEvent(result, legacyApproval)

    expect(event.ticketId).toBe('WRITE-TICKET-001')
  })
})

describe('local file write tool', () => {
  it('returns blocked output when policy disables writes', async () => {
    const output = await localFileWriteTool.execute(
      {
        targetPath: 'src/cli.ts',
        content: 'test content',
        reason: 'Add feature',
        rollbackNote: 'Revert feature',
        dryRun: true,
      },
      blockedContext,
    )

    expect(output).toContain('CodeMind local file write gate')
    expect(output).toContain('Decision: BLOCKED')
  })

  it('writes when dryRun is omitted', async () => {
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

  it('keeps explicit dryRun as preview mode', async () => {
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

  it('rejects invalid inputs', async () => {
    await expect(localFileWriteTool.execute(null, blockedContext)).rejects.toThrow(
      'Missing local file write input',
    )
    await expect(
      localFileWriteTool.execute(
        { targetPath: '', content: 'x', reason: 'y', rollbackNote: 'z' },
        blockedContext,
      ),
    ).rejects.toThrow('Missing targetPath')
    await expect(
      localFileWriteTool.execute(
        { targetPath: 'x.ts', reason: 'y', rollbackNote: 'z' },
        blockedContext,
      ),
    ).rejects.toThrow('Missing content')
  })
})

describe('local write registry and CLI', () => {
  it('includes local_file_write in the registry preset', () => {
    const registry = createFixtureRegistry('local_write')

    expect(registry.has('local_file_write')).toBe(true)
    expect(registry.getOrThrow('local_file_write').name).toBe('local_file_write')
  })

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
      expect(fs.readFileSync(path.join(tmpDir, 'src', 'cli.ts'), 'utf8')).toContain(
        'console.log("hello")',
      )
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
