import { describe, expect, it } from 'vitest'

import type { AjnaLiveReviewResult } from '../ajna/ajna-live-review.js'
import type { TuiState } from './tui.types.js'
import { createInitialTuiState } from './tui.types.js'
import { applyTuiEvent } from './tui-event-handler.js'
import type { TuiEvent } from './tui-event-handler.js'

function baseState(): TuiState {
  return createInitialTuiState('s-1', 'claude-sonnet-4-20250514', 'interactive')
}

describe('applyTuiEvent', () => {
  describe('agent_loop_event — text_delta', () => {
    it('appends text and sets streaming', () => {
      const event: TuiEvent = {
        type: 'agent_loop_event',
        event: { type: 'text_delta', text: 'hello' },
      }
      const next = applyTuiEvent(baseState(), event)
      expect(next.streaming).toBe(true)
      expect(next.streamBuffer).toBe('hello')
    })

    it('accumulates multiple deltas', () => {
      let state = baseState()
      state = applyTuiEvent(state, {
        type: 'agent_loop_event',
        event: { type: 'text_delta', text: 'a' },
      })
      state = applyTuiEvent(state, {
        type: 'agent_loop_event',
        event: { type: 'text_delta', text: 'b' },
      })
      expect(state.streamBuffer).toBe('ab')
    })
  })

  describe('agent_loop_event — tool_call_start', () => {
    it('adds a running tool to activeTools', () => {
      const event: TuiEvent = {
        type: 'agent_loop_event',
        event: { type: 'tool_call_start', id: 'tc-1', name: 'read_file' },
      }
      const next = applyTuiEvent(baseState(), event)
      expect(next.activeTools).toHaveLength(1)
      expect(next.activeTools[0]!.toolName).toBe('read_file')
      expect(next.activeTools[0]!.status).toBe('running')
    })
  })

  describe('agent_loop_event — tool_call_end', () => {
    it('marks a running tool as completed', () => {
      let state = baseState()
      state = applyTuiEvent(state, {
        type: 'agent_loop_event',
        event: { type: 'tool_call_start', id: 'tc-1', name: 'read_file' },
      })
      state = applyTuiEvent(state, {
        type: 'agent_loop_event',
        event: {
          type: 'tool_call_end',
          id: 'tc-1',
          name: 'read_file',
          output: 'contents',
          isError: false,
          durationMs: 50,
        },
      })
      expect(state.activeTools).toHaveLength(1)
      expect(state.activeTools[0]!.status).toBe('completed')
      expect(state.activeTools[0]!.elapsedMs).toBe(50)
    })

    it('marks a tool as error when isError is true', () => {
      let state = baseState()
      state = applyTuiEvent(state, {
        type: 'agent_loop_event',
        event: { type: 'tool_call_start', id: 'tc-1', name: 'bash' },
      })
      state = applyTuiEvent(state, {
        type: 'agent_loop_event',
        event: {
          type: 'tool_call_end',
          id: 'tc-1',
          name: 'bash',
          output: 'err',
          isError: true,
          durationMs: 100,
        },
      })
      expect(state.activeTools[0]!.status).toBe('error')
    })

    it('truncates output to 200 chars', () => {
      let state = baseState()
      state = applyTuiEvent(state, {
        type: 'agent_loop_event',
        event: { type: 'tool_call_start', id: 'tc-1', name: 'read_file' },
      })
      const longOutput = 'x'.repeat(300)
      state = applyTuiEvent(state, {
        type: 'agent_loop_event',
        event: {
          type: 'tool_call_end',
          id: 'tc-1',
          name: 'read_file',
          output: longOutput,
          isError: false,
          durationMs: 10,
        },
      })
      expect(state.activeTools[0]!.output).toHaveLength(200)
    })

    it('omits output field when output is empty', () => {
      let state = baseState()
      state = applyTuiEvent(state, {
        type: 'agent_loop_event',
        event: { type: 'tool_call_start', id: 'tc-1', name: 'read_file' },
      })
      state = applyTuiEvent(state, {
        type: 'agent_loop_event',
        event: {
          type: 'tool_call_end',
          id: 'tc-1',
          name: 'read_file',
          output: '',
          isError: false,
          durationMs: 10,
        },
      })
      expect(state.activeTools[0]!.output).toBeUndefined()
    })
  })

  describe('agent_loop_event — iteration_start', () => {
    it('clears stream buffer', () => {
      let state = baseState()
      state = applyTuiEvent(state, {
        type: 'agent_loop_event',
        event: { type: 'text_delta', text: 'old content' },
      })
      state = applyTuiEvent(state, {
        type: 'agent_loop_event',
        event: { type: 'iteration_start', iterationNumber: 2 },
      })
      expect(state.streamBuffer).toBe('')
    })
  })

  describe('agent_loop_event — iteration_end', () => {
    it('stops streaming and filters completed tools', () => {
      let state = baseState()
      state = applyTuiEvent(state, {
        type: 'agent_loop_event',
        event: { type: 'text_delta', text: 'data' },
      })
      state = applyTuiEvent(state, {
        type: 'agent_loop_event',
        event: { type: 'tool_call_start', id: 'tc-1', name: 'read_file' },
      })
      state = applyTuiEvent(state, {
        type: 'agent_loop_event',
        event: {
          type: 'tool_call_end',
          id: 'tc-1',
          name: 'read_file',
          output: '',
          isError: false,
          durationMs: 10,
        },
      })
      state = applyTuiEvent(state, {
        type: 'agent_loop_event',
        event: { type: 'iteration_end', iterationNumber: 1 },
      })
      expect(state.streaming).toBe(false)
      expect(state.activeTools).toHaveLength(0)
    })
  })

  describe('agent_loop_event — loop_end', () => {
    it('clears streaming and all tools', () => {
      let state = baseState()
      state = applyTuiEvent(state, {
        type: 'agent_loop_event',
        event: { type: 'text_delta', text: 'data' },
      })
      state = applyTuiEvent(state, {
        type: 'agent_loop_event',
        event: { type: 'tool_call_start', id: 'tc-1', name: 'bash' },
      })
      state = applyTuiEvent(state, {
        type: 'agent_loop_event',
        event: { type: 'loop_end', status: 'completed', totalIterations: 3 },
      })
      expect(state.streaming).toBe(false)
      expect(state.activeTools).toHaveLength(0)
    })
  })

  describe('agent_loop_event — error', () => {
    it('returns state unchanged', () => {
      const state = baseState()
      const next = applyTuiEvent(state, {
        type: 'agent_loop_event',
        event: { type: 'error', error: 'something broke' },
      })
      expect(next).toEqual(state)
    })
  })

  describe('ajna_review', () => {
    it('activates ajna with review result', () => {
      const result: AjnaLiveReviewResult = {
        riskLevel: 'HIGH',
        mergeDecision: 'NEEDS_OPERATOR_REVIEW',
        reportText: 'Report text',
        protectedFileCount: 1,
        highRiskFiles: ['src/auth.ts'],
        findings: ['Missing tests for auth module'],
        pipelineReport: {} as AjnaLiveReviewResult['pipelineReport'],
      }
      const next = applyTuiEvent(baseState(), { type: 'ajna_review', result })
      expect(next.ajna.active).toBe(true)
      expect(next.ajna.riskLevel).toBe('HIGH')
      expect(next.ajna.mergeDecision).toBe('NEEDS_OPERATOR_REVIEW')
      expect(next.ajna.findings).toEqual(['Missing tests for auth module'])
      expect(next.ajna.lastReviewedAt).toBeDefined()
    })
  })

  describe('swarm_dispatch', () => {
    it('adds a new swarm agent', () => {
      const next = applyTuiEvent(baseState(), {
        type: 'swarm_dispatch',
        agentId: 'agent-1',
        agentType: 'investigator',
        task: 'explore codebase',
      })
      expect(next.swarmAgents).toHaveLength(1)
      expect(next.swarmAgents[0]!.agentId).toBe('agent-1')
      expect(next.swarmAgents[0]!.agentType).toBe('investigator')
      expect(next.swarmAgents[0]!.status).toBe('active')
      expect(next.swarmAgents[0]!.task).toBe('explore codebase')
    })

    it('appends to existing agents', () => {
      let state = applyTuiEvent(baseState(), {
        type: 'swarm_dispatch',
        agentId: 'agent-1',
        agentType: 'investigator',
        task: 'explore',
      })
      state = applyTuiEvent(state, {
        type: 'swarm_dispatch',
        agentId: 'agent-2',
        agentType: 'coder',
        task: 'implement fix',
      })
      expect(state.swarmAgents).toHaveLength(2)
    })
  })

  describe('swarm_complete', () => {
    it('updates agent status to completed', () => {
      let state = applyTuiEvent(baseState(), {
        type: 'swarm_dispatch',
        agentId: 'agent-1',
        agentType: 'analyzer',
        task: 'run tests',
      })
      state = applyTuiEvent(state, {
        type: 'swarm_complete',
        agentId: 'agent-1',
        status: 'completed',
      })
      expect(state.swarmAgents[0]!.status).toBe('completed')
    })

    it('updates agent status to failed', () => {
      let state = applyTuiEvent(baseState(), {
        type: 'swarm_dispatch',
        agentId: 'agent-1',
        agentType: 'coder',
        task: 'write code',
      })
      state = applyTuiEvent(state, {
        type: 'swarm_complete',
        agentId: 'agent-1',
        status: 'failed',
      })
      expect(state.swarmAgents[0]!.status).toBe('failed')
    })
  })

  describe('approval_request', () => {
    it('sets approvalPending and prompt', () => {
      const next = applyTuiEvent(baseState(), {
        type: 'approval_request',
        prompt: 'Allow write to src/main.ts?',
      })
      expect(next.approvalPending).toBe(true)
      expect(next.approvalPrompt).toBe('Allow write to src/main.ts?')
    })
  })

  describe('approval_response', () => {
    it('clears approval state', () => {
      let state = applyTuiEvent(baseState(), {
        type: 'approval_request',
        prompt: 'Allow?',
      })
      state = applyTuiEvent(state, {
        type: 'approval_response',
        approved: true,
      })
      expect(state.approvalPending).toBe(false)
      expect(state.approvalPrompt).toBeUndefined()
    })
  })

  describe('token_update', () => {
    it('updates session token count and cost', () => {
      const next = applyTuiEvent(baseState(), {
        type: 'token_update',
        tokenCount: 5000,
        costEstimate: 0.015,
      })
      expect(next.session.tokenCount).toBe(5000)
      expect(next.session.costEstimate).toBe(0.015)
    })
  })
})
