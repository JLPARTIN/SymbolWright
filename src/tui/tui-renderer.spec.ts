import { describe, expect, it } from 'vitest'

import type { TuiState } from './tui.types.js'
import { createInitialTuiState } from './tui.types.js'
import {
  renderTuiStatusBar,
  renderTuiSwarmPanel,
  renderTuiAjnaPanel,
  renderTuiBatchOutput,
} from './tui-renderer.js'

function baseState(): TuiState {
  return createInitialTuiState('s-1', 'claude-sonnet-4-20250514', 'interactive')
}

describe('renderTuiStatusBar', () => {
  it('renders model and token count', () => {
    const bar = renderTuiStatusBar(baseState())
    expect(bar).toContain('[claude-sonnet-4-20250514]')
    expect(bar).toContain('tokens: 0')
  })

  it('includes cost when positive', () => {
    const state: TuiState = {
      ...baseState(),
      session: { ...baseState().session, costEstimate: 0.0123 },
    }
    const bar = renderTuiStatusBar(state)
    expect(bar).toContain('cost: $0.0123')
  })

  it('omits cost when zero', () => {
    const bar = renderTuiStatusBar(baseState())
    expect(bar).not.toContain('cost:')
  })

  it('shows streaming indicator', () => {
    const state: TuiState = { ...baseState(), streaming: true }
    const bar = renderTuiStatusBar(state)
    expect(bar).toContain('streaming...')
  })

  it('shows active tool names', () => {
    const state: TuiState = {
      ...baseState(),
      activeTools: [
        { toolName: 'read_file', startedAt: Date.now(), elapsedMs: 0, status: 'running' },
        { toolName: 'bash', startedAt: Date.now(), elapsedMs: 50, status: 'completed' },
      ],
    }
    const bar = renderTuiStatusBar(state)
    expect(bar).toContain('tools: read_file')
    expect(bar).not.toContain('bash')
  })

  it('shows active swarm count', () => {
    const state: TuiState = {
      ...baseState(),
      swarmAgents: [
        { agentId: 'a-1', agentType: 'investigator', status: 'active' },
        { agentId: 'a-2', agentType: 'coder', status: 'completed' },
      ],
    }
    const bar = renderTuiStatusBar(state)
    expect(bar).toContain('swarm: 1 active')
  })

  it('shows ajna risk level when active', () => {
    const state: TuiState = {
      ...baseState(),
      ajna: {
        active: true,
        riskLevel: 'HIGH',
        mergeDecision: 'NEEDS_OPERATOR_REVIEW',
        findings: [],
        lastReviewedAt: '2025-01-01T00:00:00.000Z',
      },
    }
    const bar = renderTuiStatusBar(state)
    expect(bar).toContain('ajna: HIGH')
  })

  it('shows approval needed indicator', () => {
    const state: TuiState = {
      ...baseState(),
      approvalPending: true,
      approvalPrompt: 'Allow?',
    }
    const bar = renderTuiStatusBar(state)
    expect(bar).toContain('[APPROVAL NEEDED]')
  })

  it('joins parts with pipe separator', () => {
    const bar = renderTuiStatusBar(baseState())
    expect(bar).toContain(' | ')
  })
})

describe('renderTuiSwarmPanel', () => {
  it('shows empty message when no agents', () => {
    const output = renderTuiSwarmPanel(baseState())
    expect(output).toBe('HiveMind: No swarm agents active.')
  })

  it('renders active agent with > icon', () => {
    const state: TuiState = {
      ...baseState(),
      swarmAgents: [
        { agentId: 'a-1', agentType: 'investigator', status: 'active', task: 'explore src/' },
      ],
    }
    const output = renderTuiSwarmPanel(state)
    expect(output).toContain('[>] investigator (a-1): active')
    expect(output).toContain('explore src/')
  })

  it('renders completed agent with + icon', () => {
    const state: TuiState = {
      ...baseState(),
      swarmAgents: [
        { agentId: 'a-1', agentType: 'coder', status: 'completed' },
      ],
    }
    const output = renderTuiSwarmPanel(state)
    expect(output).toContain('[+] coder (a-1): completed')
  })

  it('renders failed agent with x icon', () => {
    const state: TuiState = {
      ...baseState(),
      swarmAgents: [
        { agentId: 'a-1', agentType: 'analyzer', status: 'failed' },
      ],
    }
    const output = renderTuiSwarmPanel(state)
    expect(output).toContain('[x] analyzer (a-1): failed')
  })

  it('renders idle agent with - icon', () => {
    const state: TuiState = {
      ...baseState(),
      swarmAgents: [
        { agentId: 'a-1', agentType: 'reporter', status: 'idle' },
      ],
    }
    const output = renderTuiSwarmPanel(state)
    expect(output).toContain('[-] reporter (a-1): idle')
  })

  it('includes header', () => {
    const state: TuiState = {
      ...baseState(),
      swarmAgents: [
        { agentId: 'a-1', agentType: 'investigator', status: 'active' },
      ],
    }
    const output = renderTuiSwarmPanel(state)
    expect(output).toContain('HiveMind Swarm Status:')
  })
})

describe('renderTuiAjnaPanel', () => {
  it('shows inactive when ajna is off', () => {
    const output = renderTuiAjnaPanel(baseState())
    expect(output).toBe('Ajna: Inactive')
  })

  it('shows risk level and merge decision', () => {
    const state: TuiState = {
      ...baseState(),
      ajna: {
        active: true,
        riskLevel: 'MODERATE',
        mergeDecision: 'MERGE_READY',
        findings: [],
        lastReviewedAt: '2025-01-01T00:00:00.000Z',
      },
    }
    const output = renderTuiAjnaPanel(state)
    expect(output).toContain('Risk Level: MODERATE')
    expect(output).toContain('Merge Decision: MERGE_READY')
  })

  it('lists findings', () => {
    const state: TuiState = {
      ...baseState(),
      ajna: {
        active: true,
        riskLevel: 'HIGH',
        mergeDecision: 'BLOCKED',
        findings: ['Missing tests', 'Protected file changed'],
        lastReviewedAt: '2025-01-01T00:00:00.000Z',
      },
    }
    const output = renderTuiAjnaPanel(state)
    expect(output).toContain('Findings:')
    expect(output).toContain('- Missing tests')
    expect(output).toContain('- Protected file changed')
  })

  it('shows last reviewed timestamp', () => {
    const state: TuiState = {
      ...baseState(),
      ajna: {
        active: true,
        riskLevel: 'LOW',
        mergeDecision: 'MERGE_READY',
        findings: [],
        lastReviewedAt: '2025-06-15T10:30:00.000Z',
      },
    }
    const output = renderTuiAjnaPanel(state)
    expect(output).toContain('Last reviewed: 2025-06-15T10:30:00.000Z')
  })

  it('includes header', () => {
    const state: TuiState = {
      ...baseState(),
      ajna: {
        active: true,
        riskLevel: 'LOW',
        mergeDecision: undefined,
        findings: [],
        lastReviewedAt: undefined,
      },
    }
    const output = renderTuiAjnaPanel(state)
    expect(output).toContain('Ajna Review Intelligence:')
  })
})

describe('renderTuiBatchOutput', () => {
  it('returns empty string for empty state', () => {
    const output = renderTuiBatchOutput(baseState())
    expect(output).toBe('')
  })

  it('includes stream buffer content', () => {
    const state: TuiState = { ...baseState(), streamBuffer: 'Hello world' }
    const output = renderTuiBatchOutput(state)
    expect(output).toContain('Hello world')
  })

  it('includes ajna summary when active', () => {
    const state: TuiState = {
      ...baseState(),
      streamBuffer: 'output',
      ajna: {
        active: true,
        riskLevel: 'HIGH',
        mergeDecision: 'BLOCKED',
        findings: [],
        lastReviewedAt: '2025-01-01T00:00:00.000Z',
      },
    }
    const output = renderTuiBatchOutput(state)
    expect(output).toContain('[Ajna] Risk: HIGH | Merge: BLOCKED')
  })

  it('shows N/A for undefined merge decision', () => {
    const state: TuiState = {
      ...baseState(),
      ajna: {
        active: true,
        riskLevel: 'LOW',
        mergeDecision: undefined,
        findings: [],
        lastReviewedAt: undefined,
      },
    }
    const output = renderTuiBatchOutput(state)
    expect(output).toContain('Merge: N/A')
  })

  it('includes swarm summary with counts', () => {
    const state: TuiState = {
      ...baseState(),
      swarmAgents: [
        { agentId: 'a-1', agentType: 'coder', status: 'completed' },
        { agentId: 'a-2', agentType: 'analyzer', status: 'failed' },
        { agentId: 'a-3', agentType: 'investigator', status: 'completed' },
      ],
    }
    const output = renderTuiBatchOutput(state)
    expect(output).toContain('[Swarm] 2 completed, 1 failed')
  })
})
