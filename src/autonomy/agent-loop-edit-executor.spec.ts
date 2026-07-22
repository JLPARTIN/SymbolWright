import { describe, expect, it, vi } from 'vitest'

import type { LLMProvider } from '../provider/provider.types.js'
import type { RuntimeToolContext } from '../runtime/types.js'
import type { AgentLoopResult } from '../agent/agent-loop.types.js'
import {
  AgentLoopAutonomousEditExecutor,
  parseGitStatusPaths,
} from './agent-loop-edit-executor.js'
import type { AutonomousTaskNode } from './task-graph.types.js'

const PROVIDER = {} as LLMProvider
const TOOL_CONTEXT = {} as RuntimeToolContext

function task(): AutonomousTaskNode {
  return {
    id: 'edit-1',
    objective: 'Implement the mission dashboard controls',
    kind: 'edit-session',
    dependencies: [],
    resources: { reads: ['src/server/**'], writes: ['src/server/chat-ui-html.ts'] },
    state: 'ready',
    retry: { maxAttempts: 2, attempts: 0 },
    evidence: [],
    artifacts: [],
    failureDiagnostics: [],
    createdAt: '2026-07-22T20:00:00.000Z',
    updatedAt: '2026-07-22T20:00:00.000Z',
  }
}

function result(overrides: Partial<AgentLoopResult> = {}): AgentLoopResult {
  return {
    status: 'completed',
    finalText: 'Implemented the requested change.',
    iterations: [
      {
        iterationNumber: 1,
        toolCalls: [{ id: 'tool-1', name: 'write_file', input: { path: 'src/a.ts' } }],
        toolResults: [],
      },
    ],
    totalIterations: 1,
    totalUsage: { inputTokens: 10, outputTokens: 5 },
    ...overrides,
  }
}

describe('AgentLoopAutonomousEditExecutor', () => {
  it('reports completion only after a verified repository change', async () => {
    const readChangedFiles = vi
      .fn<() => Promise<readonly string[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['src/server/chat-ui-html.ts'])
    const runAgent = vi.fn(async () => result())
    const executor = new AgentLoopAutonomousEditExecutor({
      provider: PROVIDER,
      tools: [],
      toolContext: TOOL_CONTEXT,
      repositoryRoot: '/repo',
      readChangedFiles,
      runAgent,
    })

    const execution = await executor.execute(task())

    expect(execution.state).toBe('completed')
    expect(execution.modifiedFiles).toEqual(['src/server/chat-ui-html.ts'])
    expect(execution.evidence).toEqual([{ kind: 'tool-call', id: 'tool-1' }])
    expect(runAgent).toHaveBeenCalledOnce()
  })

  it('blocks a completed agent run that produced no verified change', async () => {
    const executor = new AgentLoopAutonomousEditExecutor({
      provider: PROVIDER,
      tools: [],
      toolContext: TOOL_CONTEXT,
      repositoryRoot: '/repo',
      readChangedFiles: vi.fn(async () => []),
      runAgent: vi.fn(async () => result()),
    })

    const execution = await executor.execute(task())

    expect(execution.state).toBe('blocked')
    expect(execution.diagnostics?.join(' ')).toContain('without producing a verified repository change')
  })

  it('persists diagnostics and partial changes when the agent loop fails', async () => {
    const readChangedFiles = vi
      .fn<() => Promise<readonly string[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['src/partial.ts'])
    const executor = new AgentLoopAutonomousEditExecutor({
      provider: PROVIDER,
      tools: [],
      toolContext: TOOL_CONTEXT,
      repositoryRoot: '/repo',
      readChangedFiles,
      runAgent: vi.fn(async () => result({ status: 'error', error: 'provider failed' })),
    })

    const execution = await executor.execute(task())

    expect(execution.state).toBe('failed')
    expect(execution.diagnostics).toEqual(['provider failed'])
    expect(execution.modifiedFiles).toEqual(['src/partial.ts'])
  })
})

describe('parseGitStatusPaths', () => {
  it('normalizes modified, untracked, and renamed paths', () => {
    expect(
      parseGitStatusPaths(' M src/a.ts\n?? src/new.ts\nR  src/old.ts -> src/renamed.ts\n'),
    ).toEqual(['src/a.ts', 'src/new.ts', 'src/renamed.ts'])
  })
})
