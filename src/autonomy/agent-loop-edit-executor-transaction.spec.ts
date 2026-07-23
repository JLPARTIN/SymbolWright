import { describe, expect, it, vi } from 'vitest'

import type { AgentLoopResult } from '../agent/agent-loop.types.js'
import type { LLMProvider } from '../provider/provider.types.js'
import type { RuntimeToolContext } from '../runtime/types.js'
import {
  AgentLoopAutonomousEditExecutor,
  type AgentLoopRunner,
} from './agent-loop-edit-executor.js'
import type { RepositorySemanticIndexSnapshot } from './repository-semantic-index.types.js'
import type { AutonomousTaskNode } from './task-graph.types.js'
import type {
  RepositoryEditTransaction,
  RepositoryEditTransactionManager,
} from './transactional-repository-edit.js'

const PROVIDER = {} as LLMProvider
const TOOL_CONTEXT = {} as RuntimeToolContext
const NOW = '2026-07-23T21:00:00.000Z'

function task(): AutonomousTaskNode {
  return {
    id: 'edit-transaction',
    objective: 'Update runCore and its callers',
    kind: 'edit-session',
    dependencies: [],
    resources: { reads: ['src/**'], writes: ['src/core.ts'] },
    state: 'ready',
    retry: { maxAttempts: 2, attempts: 0 },
    evidence: [],
    artifacts: [],
    failureDiagnostics: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function index(): RepositorySemanticIndexSnapshot {
  return {
    schemaVersion: 1,
    repositoryRoot: '/repo',
    createdAt: NOW,
    updatedAt: NOW,
    files: [file('src/core.ts'), file('src/service.ts')],
    symbols: [
      {
        id: 'core:runCore',
        name: 'runCore',
        kind: 'function',
        filePath: 'src/core.ts',
        line: 1,
        exported: true,
      },
    ],
    imports: [{ filePath: 'src/service.ts', source: './core.js', names: ['runCore'] }],
    references: [],
  }
}

function file(filePath: string) {
  return {
    path: filePath,
    language: 'typescript',
    contentHash: filePath,
    generated: false,
    packageOwner: 'core',
    indexedAt: NOW,
  }
}

function result(overrides: Partial<AgentLoopResult> = {}): AgentLoopResult {
  return {
    status: 'completed',
    finalText: 'Implemented the semantic edit.',
    iterations: [
      {
        iterationNumber: 1,
        toolCalls: [{ id: 'tool-write', name: 'write_file', input: {} }],
        toolResults: [],
      },
    ],
    totalIterations: 1,
    totalUsage: { inputTokens: 10, outputTokens: 5 },
    ...overrides,
  }
}

function transactionManager(input: {
  readonly modifiedFiles?: readonly string[]
  readonly unexpectedFiles?: readonly string[]
}) {
  const transaction: RepositoryEditTransaction = {
    id: 'transaction-1',
    writePolicy: 'declared',
    allowedWrites: ['src/core.ts', 'src/service.ts'],
    baselineChangedFiles: [],
  }
  const manager: RepositoryEditTransactionManager = {
    begin: vi.fn(async () => ({ state: 'ready' as const, transaction })),
    inspect: vi.fn(async () => ({
      modifiedFiles: input.modifiedFiles ?? ['src/core.ts'],
      unexpectedFiles: input.unexpectedFiles ?? [],
    })),
    commit: vi.fn(async () => undefined),
    rollback: vi.fn(async () => input.modifiedFiles ?? ['src/core.ts']),
  }
  return { manager, transaction }
}

describe('AgentLoopAutonomousEditExecutor semantic transactions', () => {
  it('feeds dependency order to the agent and commits verified in-scope changes', async () => {
    const { manager } = transactionManager({ modifiedFiles: ['src/core.ts', 'src/service.ts'] })
    let observedPrompt = ''
    const runAgent = vi.fn<AgentLoopRunner>(async (_provider, userMessage) => {
      observedPrompt = userMessage
      return result()
    })
    const executor = new AgentLoopAutonomousEditExecutor({
      provider: PROVIDER,
      tools: [],
      toolContext: TOOL_CONTEXT,
      repositoryRoot: '/repo',
      loadSemanticIndex: vi.fn(async () => index()),
      validationCommands: ['npm test'],
      transactionManager: manager,
      runAgent,
    })

    const execution = await executor.execute(task())

    expect(execution.state).toBe('completed')
    expect(execution.modifiedFiles).toEqual(['src/core.ts', 'src/service.ts'])
    expect(observedPrompt).toContain('Dependency-aware edit order: src/core.ts -> src/service.ts')
    expect(runAgent).toHaveBeenCalledOnce()
    expect(manager.commit).toHaveBeenCalledOnce()
    expect(execution.evidence).toEqual([
      { kind: 'tool-call', id: 'tool-write' },
      { kind: 'edit-session', id: 'semantic-plan-edit-transaction' },
      { kind: 'checkpoint', id: 'transaction-transaction-1' },
    ])
  })

  it('rolls back and blocks changes outside the semantic impact scope', async () => {
    const { manager } = transactionManager({
      modifiedFiles: ['src/core.ts', 'src/unrelated.ts'],
      unexpectedFiles: ['src/unrelated.ts'],
    })
    const executor = new AgentLoopAutonomousEditExecutor({
      provider: PROVIDER,
      tools: [],
      toolContext: TOOL_CONTEXT,
      repositoryRoot: '/repo',
      loadSemanticIndex: vi.fn(async () => index()),
      transactionManager: manager,
      runAgent: vi.fn(async () => result()),
    })

    const execution = await executor.execute(task())

    expect(execution.state).toBe('blocked')
    expect(execution.modifiedFiles).toEqual([])
    expect(execution.diagnostics?.join(' ')).toContain('outside the semantic edit scope')
    expect(manager.rollback).toHaveBeenCalledOnce()
    expect(manager.commit).not.toHaveBeenCalled()
  })

  it('rolls back partial edits when the provider-backed agent fails', async () => {
    const { manager } = transactionManager({ modifiedFiles: ['src/core.ts'] })
    const executor = new AgentLoopAutonomousEditExecutor({
      provider: PROVIDER,
      tools: [],
      toolContext: TOOL_CONTEXT,
      repositoryRoot: '/repo',
      transactionManager: manager,
      runAgent: vi.fn(async () => result({ status: 'error', error: 'provider failed' })),
    })

    const execution = await executor.execute(task())

    expect(execution.state).toBe('failed')
    expect(execution.modifiedFiles).toEqual([])
    expect(execution.diagnostics).toContain('provider failed')
    expect(execution.diagnostics?.join(' ')).toContain('Rolled back 1 files')
    expect(manager.rollback).toHaveBeenCalledOnce()
  })
})
