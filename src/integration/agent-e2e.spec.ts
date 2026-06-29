import { describe, expect, it } from 'vitest'

import { runAgentLoop } from '../agent/agent-loop.js'
import type { AgentLoopEvent, AgentLoopConfig } from '../agent/agent-loop.types.js'
import type { LLMProvider, ProviderStreamEvent } from '../provider/provider.types.js'
import type { RuntimeToolContext } from '../runtime/types.js'
import { assembleAgentTools, getToolByName } from '../runtime/tools/tool-assembly.js'
import { buildToolInputSchema, bridgeToolsForProvider } from '../agent/tool-schema-bridge.js'
import { CostTracker, computeCost } from '../telemetry/cost-tracker.js'
import {
  classifyError,
  formatErrorForUser,
  withRetry,
} from '../runtime/error-handling/error-handler.js'

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

    it('tool count includes core tools and excludes retired representation-only gates', () => {
      const tools = assembleAgentTools()
      const names = tools.map((t) => t.name)

      expect(names).toContain('read_file')
      expect(names).toContain('edit_file')
      expect(names).toContain('git')
      expect(names).toContain('swarm_dispatch')
      expect(names).toContain('run_tests')
      expect(names).toContain('run_typecheck')
      expect(names).toContain('run_lint')
      expect(names).toContain('apply_patch')
      expect(names).toContain('validation_command_gate')
      expect(names).not.toContain('apply_edit_gated')
      expect(names).not.toContain('command_dry_run_gated')
      expect(tools.length).toBeGreaterThanOrEqual(33)
    })
  })

  describe('one-shot agent run', () => {
    it('completes a simple text response', async () => {
      const provider = createMockProvider([
        [
          { type: 'text_delta', text: 'Hello, ' },
          { type: 'text_delta', text: 'world!' },
          {
            type: 'message_stop',
            stopReason: 'end_turn',
            usage: { inputTokens: 100, outputTokens: 20 },
          },
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
  })

  describe('error handling integration', () => {
    it('classifies and formats provider errors', () => {
      const error = new Error('Rate limit exceeded')
      const classified = classifyError(error)
      const formatted = formatErrorForUser(classified)

      expect(classified.category).toBe('provider_error')
      expect(classified.retryable).toBe(true)
      expect(formatted).toContain('rate limited')
    })

    it('withRetry succeeds on second attempt', async () => {
      let attempts = 0
      const result = await withRetry(
        async () => {
          attempts++
          if (attempts === 1) throw new Error('network timeout')
          return 'success'
        },
        { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 1 },
      )

      expect(result).toBe('success')
      expect(attempts).toBe(2)
    })
  })

  describe('tool lookup integration', () => {
    it('finds real tools by name', () => {
      expect(getToolByName('read_file')).toBeDefined()
      expect(getToolByName('bash')).toBeDefined()
      expect(getToolByName('git')).toBeDefined()
    })
  })

  describe('cost calculation integration', () => {
    it('computes cost for known model', () => {
      const cost = computeCost(
        {
          inputTokens: 1_000_000,
          outputTokens: 1_000_000,
        },
        'claude-sonnet-4-20250514',
      )

      expect(cost).toBeGreaterThan(0)
    })
  })
})
