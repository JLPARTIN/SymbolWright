import { describe, expect, it, vi } from 'vitest'

import type { LLMProvider, ProviderStreamEvent, ProviderTokenUsage } from '../provider/provider.types.js'
import type { RuntimeToolDefinition, RuntimeToolContext, RuntimePolicySnapshot } from '../runtime/types.js'
import { HiveMindRegistry } from './hivemind-registry.js'
import { HiveMindDispatcher } from './hivemind-dispatcher.js'
import type { SwarmDispatchResult } from './hivemind.types.js'

function makePolicy(overrides: Partial<RuntimePolicySnapshot> = {}): RuntimePolicySnapshot {
  return {
    mode: 'APPROVED_EXECUTION',
    allowNetwork: true,
    allowShell: true,
    allowWrites: true,
    allowGitHubWrites: false,
    protectedPaths: [],
    noisyDirs: [],
    ...overrides,
  }
}

function makeToolContext(overrides: Partial<RuntimeToolContext> = {}): RuntimeToolContext {
  return {
    cwd: '/workspace',
    policy: makePolicy(),
    ...overrides,
  }
}

function createMockProvider(options: {
  text?: string
  toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>
  usage?: ProviderTokenUsage
}): LLMProvider {
  const text = options.text ?? 'Task completed.'
  const usage = options.usage ?? { inputTokens: 100, outputTokens: 50 }
  const toolCalls = options.toolCalls ?? []

  return {
    providerId: 'mock-provider',
    displayName: 'Mock Provider',
    complete: vi.fn().mockImplementation(function* (): Generator<ProviderStreamEvent> {
      if (toolCalls.length > 0) {
        for (const call of toolCalls) {
          yield { type: 'tool_use_start', id: call.id, name: call.name }
          yield { type: 'tool_use_end', id: call.id, name: call.name, input: call.input }
        }
        yield { type: 'message_stop', stopReason: 'tool_use', usage }
      } else {
        for (const char of text) {
          yield { type: 'text_delta', text: char }
        }
        yield { type: 'message_stop', stopReason: 'end_turn', usage }
      }
    }),
  }
}

function createCompletingProvider(text: string = 'Done.'): LLMProvider {
  const usage: ProviderTokenUsage = { inputTokens: 200, outputTokens: 100 }
  let callCount = 0

  return {
    providerId: 'mock-provider',
    displayName: 'Mock Provider',
    complete: vi.fn().mockImplementation(function* (): Generator<ProviderStreamEvent> {
      callCount++
      if (callCount === 1) {
        yield { type: 'text_delta', text }
        yield { type: 'message_stop', stopReason: 'end_turn', usage }
      } else {
        yield { type: 'text_delta', text: 'Final.' }
        yield { type: 'message_stop', stopReason: 'end_turn', usage }
      }
    }),
  }
}

const DUMMY_TOOLS: readonly RuntimeToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read a file',
    capability: 'READ',
    execute: vi.fn().mockResolvedValue('file contents'),
  },
]

describe('HiveMindDispatcher', () => {
  describe('dispatch', () => {
    it('returns failure for unknown agent type', async () => {
      const registry = new HiveMindRegistry([])
      const provider = createMockProvider({ text: 'Should not reach here' })
      const dispatcher = new HiveMindDispatcher(
        registry,
        provider,
        DUMMY_TOOLS,
        makeToolContext(),
        'System prompt',
      )

      const result = await dispatcher.dispatch({
        taskId: 'task-1',
        goal: 'Explore codebase',
        agentType: 'investigator',
        input: { path: '/src' },
      })

      expect(result.status).toBe('failed')
      expect(result.output).toContain('Unknown agent type')
      expect(result.agentId).toBe('unknown')
      expect(result.durationMs).toBe(0)
      expect(result.auditReceipt.toolsUsed).toHaveLength(0)
    })

    it('dispatches to investigator agent and returns result', async () => {
      const registry = new HiveMindRegistry()
      const provider = createCompletingProvider('Found 3 relevant files.')
      const dispatcher = new HiveMindDispatcher(
        registry,
        provider,
        DUMMY_TOOLS,
        makeToolContext(),
        'Base system prompt',
      )

      const result = await dispatcher.dispatch({
        taskId: 'task-2',
        goal: 'Find auth-related files',
        agentType: 'investigator',
        input: { pattern: 'auth' },
      })

      expect(result.taskId).toBe('task-2')
      expect(result.status).toBe('completed')
      expect(result.output).toBe('Found 3 relevant files.')
      expect(result.agentId).toContain('investigator')
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
      expect(result.auditReceipt.agentType).toBe('investigator')
      expect(result.auditReceipt.role).toBe('researcher')
    })

    it('dispatches to coder agent with write-enabled policy', async () => {
      const registry = new HiveMindRegistry()
      const provider = createCompletingProvider('Code change applied.')
      const context = makeToolContext()
      const dispatcher = new HiveMindDispatcher(
        registry,
        provider,
        DUMMY_TOOLS,
        context,
        'Base prompt',
      )

      const result = await dispatcher.dispatch({
        taskId: 'task-3',
        goal: 'Fix the bug in utils.ts',
        agentType: 'coder',
        input: { file: 'utils.ts' },
      })

      expect(result.status).toBe('completed')
      expect(result.agentId).toContain('coder')
      expect(result.auditReceipt.agentType).toBe('coder')
      expect(result.auditReceipt.role).toBe('coder')
    })

    it('dispatches to analyzer agent', async () => {
      const registry = new HiveMindRegistry()
      const provider = createCompletingProvider('All tests pass.')
      const dispatcher = new HiveMindDispatcher(
        registry,
        provider,
        DUMMY_TOOLS,
        makeToolContext(),
        'Base prompt',
      )

      const result = await dispatcher.dispatch({
        taskId: 'task-4',
        goal: 'Run tests',
        agentType: 'analyzer',
        input: {},
      })

      expect(result.status).toBe('completed')
      expect(result.agentId).toContain('analyzer')
      expect(result.auditReceipt.agentType).toBe('analyzer')
      expect(result.auditReceipt.role).toBe('validator')
    })

    it('dispatches to reviewer agent', async () => {
      const registry = new HiveMindRegistry()
      const provider = createCompletingProvider('Review complete: low risk.')
      const dispatcher = new HiveMindDispatcher(
        registry,
        provider,
        DUMMY_TOOLS,
        makeToolContext(),
        'Base prompt',
      )

      const result = await dispatcher.dispatch({
        taskId: 'task-5',
        goal: 'Review changes',
        agentType: 'reviewer',
        input: {},
      })

      expect(result.status).toBe('completed')
      expect(result.agentId).toContain('reviewer')
      expect(result.auditReceipt.agentType).toBe('reviewer')
      expect(result.auditReceipt.role).toBe('validator')
    })

    it('dispatches to reporter agent', async () => {
      const registry = new HiveMindRegistry()
      const provider = createCompletingProvider('Status report generated.')
      const dispatcher = new HiveMindDispatcher(
        registry,
        provider,
        DUMMY_TOOLS,
        makeToolContext(),
        'Base prompt',
      )

      const result = await dispatcher.dispatch({
        taskId: 'task-6',
        goal: 'Generate status report',
        agentType: 'reporter',
        input: {},
      })

      expect(result.status).toBe('completed')
      expect(result.agentId).toContain('reporter')
      expect(result.auditReceipt.agentType).toBe('reporter')
      expect(result.auditReceipt.role).toBe('memory-auditor')
    })

    it('respects maxIterations parameter', async () => {
      const registry = new HiveMindRegistry()
      const provider = createCompletingProvider('Quick result.')
      const dispatcher = new HiveMindDispatcher(
        registry,
        provider,
        DUMMY_TOOLS,
        makeToolContext(),
        'Base prompt',
      )

      const result = await dispatcher.dispatch({
        taskId: 'task-7',
        goal: 'Quick lookup',
        agentType: 'investigator',
        input: {},
        maxIterations: 5,
      })

      expect(result.status).toBe('completed')
      expect(result.auditReceipt.iterationCount).toBeGreaterThanOrEqual(1)
    })

    it('records token usage in audit receipt', async () => {
      const registry = new HiveMindRegistry()
      const provider = createCompletingProvider('Result with tokens.')
      const dispatcher = new HiveMindDispatcher(
        registry,
        provider,
        DUMMY_TOOLS,
        makeToolContext(),
        'Base prompt',
      )

      const result = await dispatcher.dispatch({
        taskId: 'task-8',
        goal: 'Track usage',
        agentType: 'investigator',
        input: {},
      })

      expect(result.auditReceipt.tokenUsage.inputTokens).toBeGreaterThan(0)
      expect(result.auditReceipt.tokenUsage.outputTokens).toBeGreaterThan(0)
      expect(result.auditReceipt.timestamp).toBeTruthy()
    })

    it('each dispatch creates a unique agent id', async () => {
      const registry = new HiveMindRegistry()
      const provider = createCompletingProvider('Done.')
      const dispatcher = new HiveMindDispatcher(
        registry,
        provider,
        DUMMY_TOOLS,
        makeToolContext(),
        'Base prompt',
      )

      const result1 = await dispatcher.dispatch({
        taskId: 'task-a',
        goal: 'First',
        agentType: 'investigator',
        input: {},
      })

      const result2 = await dispatcher.dispatch({
        taskId: 'task-b',
        goal: 'Second',
        agentType: 'investigator',
        input: {},
      })

      expect(result1.agentId).not.toBe(result2.agentId)
    })

    it('empty receipt has correct defaults', async () => {
      const registry = new HiveMindRegistry([])
      const provider = createMockProvider({ text: 'x' })
      const dispatcher = new HiveMindDispatcher(
        registry,
        provider,
        DUMMY_TOOLS,
        makeToolContext(),
        'Base prompt',
      )

      const result = await dispatcher.dispatch({
        taskId: 'task-empty',
        goal: 'Fail gracefully',
        agentType: 'investigator',
        input: {},
      })

      expect(result.auditReceipt.taskId).toBe('task-empty')
      expect(result.auditReceipt.agentId).toBe('unknown')
      expect(result.auditReceipt.toolsUsed).toEqual([])
      expect(result.auditReceipt.iterationCount).toBe(0)
      expect(result.auditReceipt.tokenUsage.inputTokens).toBe(0)
      expect(result.auditReceipt.tokenUsage.outputTokens).toBe(0)
    })
  })
})
