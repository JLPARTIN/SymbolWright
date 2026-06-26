import { describe, expect, it } from 'vitest'

import { runAgentLoop } from './agent-loop.js'
import type { LLMProvider, ProviderStreamEvent } from '../provider/provider.types.js'
import type { RuntimeToolDefinition, RuntimePolicySnapshot, RuntimeToolContext } from '../runtime/types.js'
import type { AgentLoopConfig, AgentLoopEvent } from './agent-loop.types.js'

function makeMockProvider(responses: ProviderStreamEvent[][]): LLMProvider {
  let callIndex = 0
  return {
    providerId: 'mock',
    displayName: 'Mock Provider',
    async *complete() {
      const events = responses[callIndex] ?? []
      callIndex++
      for (const event of events) {
        yield event
      }
    },
  }
}

function makeTextResponse(text: string, inputTokens = 100, outputTokens = 50): ProviderStreamEvent[] {
  return [
    { type: 'text_delta', text },
    {
      type: 'message_stop',
      stopReason: 'end_turn',
      usage: { inputTokens, outputTokens },
    },
  ]
}

function makeToolUseResponse(
  toolId: string,
  toolName: string,
  input: Record<string, unknown>,
  inputTokens = 200,
  outputTokens = 100,
): ProviderStreamEvent[] {
  return [
    { type: 'tool_use_start', id: toolId, name: toolName },
    { type: 'tool_use_delta', partialJson: JSON.stringify(input) },
    { type: 'tool_use_end', id: toolId, name: toolName, input },
    {
      type: 'message_stop',
      stopReason: 'tool_use',
      usage: { inputTokens, outputTokens },
    },
  ]
}

function makeTool(name: string, output: string | (() => Promise<string>)): RuntimeToolDefinition {
  return {
    name: name as RuntimeToolDefinition['name'],
    description: `Mock tool: ${name}`,
    capability: 'READ' as RuntimeToolDefinition['capability'],
    execute: typeof output === 'function'
      ? output
      : async () => output,
  }
}

function makeToolContext(): RuntimeToolContext {
  const policy: RuntimePolicySnapshot = {
    mode: 'APPROVED_EXECUTION',
    allowNetwork: true,
    allowShell: false,
    allowWrites: false,
    allowGitHubWrites: false,
    protectedPaths: [],
    noisyDirs: [],
  }
  return { cwd: '/test', policy }
}

function makeConfig(overrides: Partial<AgentLoopConfig> = {}): AgentLoopConfig {
  return {
    maxIterations: 10,
    systemPrompt: 'You are a test agent.',
    ...overrides,
  }
}

describe('agent-loop', () => {
  describe('runAgentLoop', () => {
    it('completes with text response (no tool use)', async () => {
      const provider = makeMockProvider([makeTextResponse('Hello, I can help!')])
      const result = await runAgentLoop(
        provider,
        'What can you do?',
        [],
        makeToolContext(),
        makeConfig(),
      )

      expect(result.status).toBe('completed')
      expect(result.finalText).toBe('Hello, I can help!')
      expect(result.totalIterations).toBe(1)
      expect(result.iterations).toHaveLength(1)
      expect(result.totalUsage.inputTokens).toBe(100)
      expect(result.totalUsage.outputTokens).toBe(50)
    })

    it('executes tool and returns final text', async () => {
      const provider = makeMockProvider([
        makeToolUseResponse('t-1', 'read_file', { path: '/test.ts' }),
        makeTextResponse('The file contains test code.'),
      ])

      const tools = [makeTool('read_file', 'export function test() {}')]
      const result = await runAgentLoop(
        provider,
        'Read test.ts',
        tools,
        makeToolContext(),
        makeConfig(),
      )

      expect(result.status).toBe('completed')
      expect(result.finalText).toBe('The file contains test code.')
      expect(result.totalIterations).toBe(2)
      expect(result.iterations).toHaveLength(2)
      expect(result.iterations[0]?.toolCalls).toHaveLength(1)
      expect(result.iterations[0]?.toolResults).toHaveLength(1)
      expect(result.iterations[0]?.toolResults[0]?.isError).toBe(false)
    })

    it('handles tool execution error', async () => {
      const provider = makeMockProvider([
        makeToolUseResponse('t-1', 'read_file', { path: '/nonexistent.ts' }),
        makeTextResponse('Sorry, that file does not exist.'),
      ])

      const tools = [
        makeTool('read_file', async () => {
          throw new Error('ENOENT: file not found')
        }),
      ]

      const result = await runAgentLoop(
        provider,
        'Read nonexistent.ts',
        tools,
        makeToolContext(),
        makeConfig(),
      )

      expect(result.status).toBe('completed')
      expect(result.iterations[0]?.toolResults[0]?.isError).toBe(true)
      expect(result.iterations[0]?.toolResults[0]?.output).toContain('ENOENT')
    })

    it('handles unknown tool call', async () => {
      const provider = makeMockProvider([
        makeToolUseResponse('t-1', 'unknown_tool', {}),
        makeTextResponse('That tool is not available.'),
      ])

      const result = await runAgentLoop(
        provider,
        'Use unknown tool',
        [],
        makeToolContext(),
        makeConfig(),
      )

      expect(result.status).toBe('completed')
      expect(result.iterations[0]?.toolResults[0]?.isError).toBe(true)
      expect(result.iterations[0]?.toolResults[0]?.output).toContain('Unknown tool')
    })

    it('respects max iterations limit', async () => {
      const toolResponses = Array.from({ length: 5 }, (_, i) =>
        makeToolUseResponse(`t-${i}`, 'read_file', { path: `/file${i}.ts` }),
      )
      const provider = makeMockProvider(toolResponses)
      const tools = [makeTool('read_file', 'file content')]

      const result = await runAgentLoop(
        provider,
        'Read many files',
        tools,
        makeToolContext(),
        makeConfig({ maxIterations: 3 }),
      )

      expect(result.status).toBe('tool_use_limit')
      expect(result.totalIterations).toBe(3)
    })

    it('handles provider error', async () => {
      const provider: LLMProvider = {
        providerId: 'error-provider',
        displayName: 'Error Provider',
        async *complete() {
          yield* []
          throw new Error('API rate limit exceeded')
        },
      }

      const result = await runAgentLoop(
        provider,
        'Do something',
        [],
        makeToolContext(),
        makeConfig(),
      )

      expect(result.status).toBe('error')
      expect(result.error).toContain('rate limit')
    })

    it('emits events via callback', async () => {
      const provider = makeMockProvider([makeTextResponse('Done.')])
      const events: AgentLoopEvent[] = []

      await runAgentLoop(
        provider,
        'Hi',
        [],
        makeToolContext(),
        makeConfig(),
        (event) => events.push(event),
      )

      const types = events.map((e) => e.type)
      expect(types).toContain('iteration_start')
      expect(types).toContain('text_delta')
      expect(types).toContain('iteration_end')
      expect(types).toContain('loop_end')
    })

    it('accumulates total usage across iterations', async () => {
      const provider = makeMockProvider([
        makeToolUseResponse('t-1', 'read_file', { path: '/a.ts' }, 200, 100),
        makeTextResponse('Done.', 150, 75),
      ])

      const tools = [makeTool('read_file', 'content')]
      const result = await runAgentLoop(
        provider,
        'Read a.ts',
        tools,
        makeToolContext(),
        makeConfig(),
      )

      expect(result.totalUsage.inputTokens).toBe(350)
      expect(result.totalUsage.outputTokens).toBe(175)
    })

    it('multi-tool call in single iteration', async () => {
      const provider = makeMockProvider([
        [
          { type: 'tool_use_start' as const, id: 't-1', name: 'read_file' },
          { type: 'tool_use_end' as const, id: 't-1', name: 'read_file', input: { path: '/a.ts' } },
          { type: 'tool_use_start' as const, id: 't-2', name: 'list_files' },
          { type: 'tool_use_end' as const, id: 't-2', name: 'list_files', input: { path: '/src' } },
          {
            type: 'message_stop' as const,
            stopReason: 'tool_use' as const,
            usage: { inputTokens: 200, outputTokens: 100 },
          },
        ],
        makeTextResponse('Both tools executed.'),
      ])

      const tools = [
        makeTool('read_file', 'file content'),
        makeTool('list_files', 'file1.ts\nfile2.ts'),
      ]

      const result = await runAgentLoop(
        provider,
        'Read a.ts and list /src',
        tools,
        makeToolContext(),
        makeConfig(),
      )

      expect(result.status).toBe('completed')
      expect(result.iterations[0]?.toolCalls).toHaveLength(2)
      expect(result.iterations[0]?.toolResults).toHaveLength(2)
    })
  })
})
