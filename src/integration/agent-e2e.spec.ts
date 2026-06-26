import { describe, expect, it } from 'vitest'

import { runAgentLoop } from '../agent/agent-loop.js'
import type { AgentLoopEvent, AgentLoopConfig } from '../agent/agent-loop.types.js'
import type { LLMProvider, ProviderStreamEvent } from '../provider/provider.types.js'
import type { RuntimeToolContext } from '../runtime/types.js'
import { assembleAgentTools, getToolByName } from '../runtime/tools/tool-assembly.js'
import { buildToolInputSchema, bridgeToolsForProvider } from '../agent/tool-schema-bridge.js'
import { CostTracker, computeCost } from '../telemetry/cost-tracker.js'
import { classifyError, formatErrorForUser, withRetry } from '../runtime/error-handling/error-handler.js'

function createMockProvider(responses: ProviderStreamEvent[][]): LLMProvider {
  let callIndex = 0
  return {
    providerId: 'mock',
    displayName: 'Mock Provider',
    async *complete() {
      const events = responses[callIndex] ?? responses[responses.length - 1]!
      callIndex++
      for (const event of events) {
        yield event
      }
    },
  }
}

function createToolContext(): RuntimeToolContext {
  return {
    cwd: process.cwd(),
    policy: {
      mode: 'APPROVED_EXECUTION',
      allowNetwork: false,
      allowShell: true,
      allowWrites: true,
      allowGitHubWrites: false,
      protectedPaths: [],
      noisyDirs: ['node_modules', '.git', 'dist'],
    },
  }
}

describe('agent-e2e', () => {
  describe('tool assembly integration', () => {
    it('all assembled tools have valid schemas', () => {
      const tools = assembleAgentTools()
      for (const tool of tools) {
        const schema = buildToolInputSchema(tool)
        expect(schema.type).toBe('object')
        expect(schema.properties).toBeDefined()
      }
    })

    it('all tools bridge correctly for APPROVED_EXECUTION mode', () => {
      const tools = assembleAgentTools()
      const context = createToolContext()
      const bridged = bridgeToolsForProvider(tools, context.policy)

      expect(bridged.length).toBe(tools.length)
      for (const bt of bridged) {
        expect(bt.providerTool.name).toBe(bt.runtimeTool.name)
        expect(bt.providerTool.inputSchema).toBeDefined()
      }
    })

    it('tool count includes core and new tools', () => {
      const tools = assembleAgentTools()
      const names = tools.map((t) => t.name)

      expect(names).toContain('read_file')
      expect(names).toContain('edit_file')
      expect(names).toContain('git')
      expect(names).toContain('swarm_dispatch')
      expect(names).toContain('run_tests')
      expect(names).toContain('run_typecheck')
      expect(names).toContain('run_lint')
      expect(tools.length).toBeGreaterThanOrEqual(35)
    })
  })

  describe('one-shot agent run', () => {
    it('completes a simple text response', async () => {
      const provider = createMockProvider([
        [
          { type: 'text_delta', text: 'Hello, ' },
          { type: 'text_delta', text: 'world!' },
          { type: 'message_stop', stopReason: 'end_turn', usage: { inputTokens: 100, outputTokens: 20 } },
        ],
      ])

      const events: AgentLoopEvent[] = []
      const config: AgentLoopConfig = { maxIterations: 5, systemPrompt: 'You are CodeMind.' }

      const result = await runAgentLoop(
        provider,
        'Say hello',
        [],
        createToolContext(),
        config,
        (e) => events.push(e),
      )

      expect(result.status).toBe('completed')
      expect(result.finalText).toBe('Hello, world!')
      expect(result.totalIterations).toBe(1)
      expect(events.some((e) => e.type === 'text_delta')).toBe(true)
      expect(events.some((e) => e.type === 'loop_end')).toBe(true)
    })
  })

  describe('cost tracking integration', () => {
    it('records and summarizes usage', () => {
      const tracker = new CostTracker()
      const usage = { inputTokens: 1000, outputTokens: 500 }

      tracker.record('session-1', 'claude-sonnet-4-20250514', usage, 'orchestrator')
      const summary = tracker.summarize('session-1')

      expect(summary.totalInputTokens).toBe(1000)
      expect(summary.totalOutputTokens).toBe(500)
      expect(summary.totalCostUsd).toBeGreaterThan(0)
      expect(summary.recordCount).toBe(1)
    })

    it('computes cost correctly', () => {
      const cost = computeCost(
        { inputTokens: 1_000_000, outputTokens: 1_000_000 },
        'claude-sonnet-4-20250514',
      )
      expect(cost).toBe(18)
    })
  })

  describe('error handling integration', () => {
    it('classifies and formats provider errors', () => {
      const error = new Error('API key invalid: unauthorized')
      const classified = classifyError(error)

      expect(classified.category).toBe('provider_error')
      expect(classified.retryable).toBe(false)

      const formatted = formatErrorForUser(classified)
      expect(formatted).toContain('API key')
    })

    it('classifies rate limit as retryable', () => {
      const error = new Error('rate limit exceeded')
      const classified = classifyError(error)

      expect(classified.category).toBe('provider_error')
      expect(classified.retryable).toBe(true)
    })

    it('withRetry succeeds on second attempt', async () => {
      let attempt = 0
      const result = await withRetry(
        async () => {
          attempt++
          if (attempt === 1) throw new Error('rate limit exceeded')
          return 'success'
        },
        { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 10 },
      )

      expect(result).toBe('success')
      expect(attempt).toBe(2)
    })
  })

  describe('getToolByName integration', () => {
    it('finds read_file tool', () => {
      const tool = getToolByName('read_file')
      expect(tool).toBeDefined()
      expect(tool?.capability).toBe('READ')
    })

    it('finds swarm_dispatch tool', () => {
      const tool = getToolByName('swarm_dispatch')
      expect(tool).toBeDefined()
      expect(tool?.capability).toBe('APPROVED_COMMAND')
    })
  })
})
