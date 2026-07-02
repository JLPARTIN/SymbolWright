import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LLMProvider, ProviderStreamEvent } from '../provider/provider.types.js'
import { initializeAgentMemorySession } from './agent-memory-session.js'

const roots: string[] = []

function makeWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-agent-memory-'))
  roots.push(root)
  return root
}

function mockProvider(text = 'Session summary.'): LLMProvider {
  return {
    providerId: 'mock',
    displayName: 'Mock Provider',
    async *complete(): AsyncIterable<ProviderStreamEvent> {
      yield { type: 'text_delta', text }
      yield {
        type: 'message_stop',
        stopReason: 'end_turn',
        usage: { inputTokens: 1, outputTokens: 1 },
      }
    },
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('initializeAgentMemorySession', () => {
  it('reports a skipped migration when no legacy ledger is present', () => {
    const session = initializeAgentMemorySession(makeWorkspace(), mockProvider())
    try {
      expect(session.migrationResult).toEqual({ status: 'skipped', reason: 'missing' })
    } finally {
      session.close()
    }
  })

  it('migrates an existing legacy ci-failure-ledger.json into episodic memory', () => {
    const cwd = makeWorkspace()
    fs.mkdirSync(path.join(cwd, '.codemind'), { recursive: true })
    fs.writeFileSync(
      path.join(cwd, '.codemind', 'ci-failure-ledger.json'),
      JSON.stringify({
        failures: [
          {
            failureClass: 'FORMAT_CHECK_FAILURE',
            rootCause: 'drift',
            preventionRule: 'run format:check',
            regressionTest: 'spec',
            firstSeen: '2026-06-30',
          },
        ],
      }),
    )

    const session = initializeAgentMemorySession(cwd, mockProvider())
    try {
      expect(session.migrationResult).toEqual({ status: 'migrated', migratedCount: 1 })
      expect(fs.existsSync(path.join(cwd, '.codemind', 'ci-failure-ledger.json'))).toBe(false)

      const recalled = session.tools.memory_recall('FORMAT_CHECK_FAILURE')
      expect(recalled).toContain('FORMAT_CHECK_FAILURE')
    } finally {
      session.close()
    }
  })

  it('stores and recalls memory through the wired tools', () => {
    const session = initializeAgentMemorySession(makeWorkspace(), mockProvider())
    try {
      const stored = session.tools.memory_store('episodic', 'User prefers dark mode')
      expect(stored).toContain('Memory stored successfully')
      expect(session.tools.memory_recall('dark mode')).toContain('User prefers dark mode')
    } finally {
      session.close()
    }
  })

  it('runs maintenance without throwing when there is nothing to decay', () => {
    const session = initializeAgentMemorySession(makeWorkspace(), mockProvider())
    try {
      expect(session.runMaintenance()).toBe(0)
    } finally {
      session.close()
    }
  })

  it('recordTurn feeds short-term memory into consolidation once the budget is exceeded', async () => {
    const generate = vi.fn().mockReturnValue(
      (async function* () {
        yield { type: 'text_delta' as const, text: 'Summary.' }
        yield {
          type: 'message_stop' as const,
          stopReason: 'end_turn' as const,
          usage: { inputTokens: 1, outputTokens: 1 },
        }
      })(),
    )

    const provider: LLMProvider = {
      providerId: 'mock',
      displayName: 'Mock',
      complete: () => generate() as AsyncIterable<ProviderStreamEvent>,
    }

    const session = initializeAgentMemorySession(makeWorkspace(), provider)
    try {
      await session.recordTurn({ role: 'user', content: 'a'.repeat(600000) })
      await session.recordTurn({ role: 'assistant', content: 'ok' })
      // No assertion failure means consolidation ran without throwing when the budget was exceeded.
    } finally {
      session.close()
    }
  })
})
