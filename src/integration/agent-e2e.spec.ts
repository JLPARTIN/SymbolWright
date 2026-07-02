import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

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
import { AgentMemoryTools } from '../memory/agent-tools.js'
import { ContextBudgeter } from '../memory/context-budgeter.js'
import { ProceduralMemory } from '../memory/procedural-memory.js'
import { RetrievalEngine } from '../memory/retrieval-engine.js'
import { MemoryDatabase } from '../memory/storage/database.js'
import { LocalLexicalStore } from '../memory/storage/lexical-store.js'

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
      allowReadOnlyNetwork: true,
      allowShell: true,
      allowWrites: true,
      allowGitHubWrites: false,
      protectedPaths: [],
      noisyDirs: ['node_modules', '.git', 'dist'],
    },
  }
}

const memoryRoots: string[] = []

afterEach(() => {
  for (const root of memoryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function createMemoryToolContext(): RuntimeToolContext {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-agent-e2e-memory-'))
  memoryRoots.push(root)

  const db = new MemoryDatabase(path.join(root, 'codemind.db'))
  const lexicalStore = new LocalLexicalStore(db)
  const proceduralMemory = new ProceduralMemory(path.join(root, 'procedures.yaml'))
  const budgeter = new ContextBudgeter()
  const retrievalEngine = new RetrievalEngine(db, lexicalStore, budgeter)
  const memoryTools = new AgentMemoryTools(
    db,
    lexicalStore,
    proceduralMemory,
    retrievalEngine,
    budgeter,
  )

  return {
    ...createToolContext(),
    memoryTools,
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
      expect(names).toContain('memory_recall')
      expect(names).toContain('memory_store')
      expect(names).toContain('preflight')
      expect(names).not.toContain('apply_edit_gated')
      expect(names).not.toContain('command_dry_run_gated')
      expect(tools.length).toBeGreaterThanOrEqual(36)
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

  describe('cognitive memory tool integration', () => {
    it('recalls in a later turn what an earlier turn stored through the real memory tools', async () => {
      const toolContext = createMemoryToolContext()
      const config: AgentLoopConfig = { maxIterations: 5, systemPrompt: 'You are CodeMind.' }

      const storeProvider = createMockProvider([
        [
          { type: 'tool_use_start', id: 't-store', name: 'memory_store' },
          {
            type: 'tool_use_end',
            id: 't-store',
            name: 'memory_store',
            input: { type: 'episodic', content: 'The user prefers dark mode.' },
          },
          {
            type: 'message_stop',
            stopReason: 'tool_use',
            usage: { inputTokens: 50, outputTokens: 20 },
          },
        ],
        [
          { type: 'text_delta', text: 'Noted.' },
          {
            type: 'message_stop',
            stopReason: 'end_turn',
            usage: { inputTokens: 10, outputTokens: 5 },
          },
        ],
      ])

      const storeResult = await runAgentLoop(
        storeProvider,
        'Remember that I prefer dark mode.',
        assembleAgentTools(),
        toolContext,
        config,
        () => undefined,
      )

      const storeToolResult = storeResult.iterations[0]?.toolResults[0]
      expect(storeToolResult?.name).toBe('memory_store')
      expect(storeToolResult?.output).toContain('Memory stored successfully')

      const recallProvider = createMockProvider([
        [
          { type: 'tool_use_start', id: 't-recall', name: 'memory_recall' },
          {
            type: 'tool_use_end',
            id: 't-recall',
            name: 'memory_recall',
            input: { query: 'dark mode' },
          },
          {
            type: 'message_stop',
            stopReason: 'tool_use',
            usage: { inputTokens: 50, outputTokens: 20 },
          },
        ],
        [
          { type: 'text_delta', text: 'You prefer dark mode.' },
          {
            type: 'message_stop',
            stopReason: 'end_turn',
            usage: { inputTokens: 10, outputTokens: 5 },
          },
        ],
      ])

      const recallResult = await runAgentLoop(
        recallProvider,
        'What theme do I prefer?',
        assembleAgentTools(),
        toolContext,
        config,
        () => undefined,
      )

      const recallToolResult = recallResult.iterations[0]?.toolResults[0]
      expect(recallToolResult?.name).toBe('memory_recall')
      expect(recallToolResult?.output).toContain('The user prefers dark mode.')
    })

    it('reports memory as uninitialized when no memory session is attached to the context', async () => {
      const config: AgentLoopConfig = { maxIterations: 5, systemPrompt: 'You are CodeMind.' }
      const provider = createMockProvider([
        [
          { type: 'tool_use_start', id: 't-recall', name: 'memory_recall' },
          {
            type: 'tool_use_end',
            id: 't-recall',
            name: 'memory_recall',
            input: { query: 'anything' },
          },
          {
            type: 'message_stop',
            stopReason: 'tool_use',
            usage: { inputTokens: 10, outputTokens: 5 },
          },
        ],
        [
          { type: 'text_delta', text: 'ok' },
          {
            type: 'message_stop',
            stopReason: 'end_turn',
            usage: { inputTokens: 10, outputTokens: 5 },
          },
        ],
      ])

      const result = await runAgentLoop(
        provider,
        'Recall something',
        assembleAgentTools(),
        createToolContext(),
        config,
        () => undefined,
      )

      expect(result.iterations[0]?.toolResults[0]?.output).toBe(
        'Memory is not initialized for this session.',
      )
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
