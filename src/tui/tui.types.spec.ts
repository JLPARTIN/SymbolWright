import { describe, expect, it } from 'vitest'

import { createInitialTuiState } from './tui.types.js'

describe('createInitialTuiState', () => {
  it('creates state with correct defaults', () => {
    const state = createInitialTuiState('session-1', 'claude-sonnet-4-20250514', 'interactive')

    expect(state.mode).toBe('interactive')
    expect(state.streaming).toBe(false)
    expect(state.streamBuffer).toBe('')
    expect(state.activeTools).toHaveLength(0)
    expect(state.swarmAgents).toHaveLength(0)
    expect(state.ajna.active).toBe(false)
    expect(state.session.sessionId).toBe('session-1')
    expect(state.session.model).toBe('claude-sonnet-4-20250514')
    expect(state.session.tokenCount).toBe(0)
    expect(state.approvalPending).toBe(false)
  })

  it('creates oneshot mode state', () => {
    const state = createInitialTuiState('s-2', 'model', 'oneshot')
    expect(state.mode).toBe('oneshot')
  })

  it('creates batch mode state', () => {
    const state = createInitialTuiState('s-3', 'model', 'batch')
    expect(state.mode).toBe('batch')
  })
})
