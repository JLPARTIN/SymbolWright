import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { SandboxHistoryStore } from './sandbox-history.js'
import { buildSandboxInventory } from './sandbox-registry.js'
import { SandboxService } from './sandbox-service.js'
import type { SandboxExecutionResult } from './sandbox-types.js'

const roots: string[] = []

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'codemind-sandbox-history-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function sampleResult(): SandboxExecutionResult {
  return {
    executionId: 'sandbox_test_1',
    languageId: 'javascript',
    runnerId: 'browser-javascript',
    trustClass: 'browser-isolated',
    backend: 'browser',
    status: 'policy-blocked',
    startedAt: '2026-07-20T00:00:00.000Z',
    completedAt: '2026-07-20T00:00:00.010Z',
    durationMs: 10,
    stdout: 'Authorization: Bearer abcdefghijklmnop',
    stderr: 'token=secret-value',
    outputTruncated: false,
    diagnostics: [],
    artifacts: [],
    evidence: {
      verificationLevel: 'UNVERIFIED',
      inputHash: 'a'.repeat(64),
      outputExcerpt: 'Authorization: Bearer abcdefghijklmnop',
      policyDecision: 'blocked',
      policyReason: 'blocked for test',
    },
    cleanup: { attempted: false, succeeded: true },
  }
}

describe('SandboxHistoryStore', () => {
  it('persists redacted execution records under .codemind/sandbox', () => {
    const store = new SandboxHistoryStore({
      workspaceRoot: tempRoot(),
      now: () => new Date('2026-07-20T00:00:00.000Z'),
    })

    const record = store.record(sampleResult(), 'mission_1')
    expect(record.executionId).toBe('sandbox_test_1')
    expect(record.result.stdout).not.toContain('abcdefghijklmnop')
    expect(record.result.stderr).not.toContain('secret-value')

    const loaded = store.read('sandbox_test_1')
    expect(loaded?.missionId).toBe('mission_1')
    expect(store.list().executions[0]?.executionId).toBe('sandbox_test_1')
  })

  it('rejects traversal-shaped execution ids', () => {
    const store = new SandboxHistoryStore({ workspaceRoot: tempRoot() })
    expect(() => store.read('../escape')).toThrow('Invalid sandbox execution id')
  })
})

describe('SandboxService history integration', () => {
  it('records policy-blocked execution results without claiming execution succeeded', async () => {
    const root = tempRoot()
    const historyStore = new SandboxHistoryStore({ workspaceRoot: root })
    const service = new SandboxService({
      inventory: buildSandboxInventory({ now: () => new Date('2026-07-20T00:00:00.000Z') }),
      historyStore,
      now: () => new Date('2026-07-20T00:00:00.000Z'),
      generateExecutionId: () => 'sandbox_service_test',
    })

    const result = await service.execute(
      {
        languageId: 'javascript',
        mode: 'run',
        source: 'console.log("hello")',
        requestedRunnerId: 'browser-javascript',
      },
      { mode: 'READ_ONLY' },
    )

    expect(result.status).toBe('policy-blocked')
    expect(service.getExecution('sandbox_service_test')?.result.status).toBe('policy-blocked')
    expect(service.listExecutions().executions[0]?.executionId).toBe('sandbox_service_test')
  })
})
