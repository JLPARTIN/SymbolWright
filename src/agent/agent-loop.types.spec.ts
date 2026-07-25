import { describe, expect, it } from 'vitest'

import {
  AGENT_LOOP_STATUSES,
  AGENT_LOOP_EVENT_TYPES,
  type AgentLoopConfig,
  type AgentLoopResult,
  type AgentLoopEvent,
} from './agent-loop.types.js'

describe('agent-loop.types', () => {
  describe('AGENT_LOOP_STATUSES', () => {
    it('includes all expected statuses', () => {
      expect(AGENT_LOOP_STATUSES).toEqual(['completed', 'tool_use_limit', 'error'])
    })
  })

  describe('AGENT_LOOP_EVENT_TYPES', () => {
    it('includes all expected event types', () => {
      expect(AGENT_LOOP_EVENT_TYPES).toEqual([
        'text_delta',
        'tool_call_start',
        'tool_call_end',
        'iteration_start',
        'iteration_end',
        'loop_end',
        'error',
      ])
    })
  })

  describe('AgentLoopConfig', () => {
    it('has required fields', () => {
      const config: AgentLoopConfig = {
        maxIterations: 50,
        systemPrompt: 'You are SymbolWright.',
      }
      expect(config.maxIterations).toBe(50)
      expect(config.systemPrompt).toContain('SymbolWright')
    })

    it('supports optional fields', () => {
      const config: AgentLoopConfig = {
        maxIterations: 10,
        systemPrompt: 'Test',
        model: 'claude-sonnet-4-20250514',
        maxTokens: 4096,
        temperature: 0.7,
      }
      expect(config.model).toBe('claude-sonnet-4-20250514')
    })
  })

  describe('AgentLoopResult', () => {
    it('represents completed result', () => {
      const result: AgentLoopResult = {
        status: 'completed',
        finalText: 'Done.',
        iterations: [],
        totalIterations: 1,
        totalUsage: { inputTokens: 100, outputTokens: 50 },
      }
      expect(result.status).toBe('completed')
      expect(result.error).toBeUndefined()
    })

    it('represents error result', () => {
      const result: AgentLoopResult = {
        status: 'error',
        finalText: '',
        iterations: [],
        totalIterations: 1,
        totalUsage: { inputTokens: 0, outputTokens: 0 },
        error: 'API error',
      }
      expect(result.status).toBe('error')
      expect(result.error).toBe('API error')
    })
  })

  describe('AgentLoopEvent discriminated union', () => {
    it('narrows by type', () => {
      const events: AgentLoopEvent[] = [
        { type: 'text_delta', text: 'Hello' },
        { type: 'tool_call_start', id: 't-1', name: 'read_file' },
        {
          type: 'tool_call_end',
          id: 't-1',
          name: 'read_file',
          output: 'contents',
          isError: false,
          durationMs: 50,
        },
        { type: 'iteration_start', iterationNumber: 1 },
        { type: 'iteration_end', iterationNumber: 1 },
        { type: 'loop_end', status: 'completed', totalIterations: 1 },
        { type: 'error', error: 'oops' },
      ]

      expect(events.map((e) => e.type)).toEqual(AGENT_LOOP_EVENT_TYPES)
    })
  })
})
