import type { AgentLoopEvent } from '../agent/agent-loop.types.js'
import type { AjnaRiskLevel } from '../ajna/ajna-risk-synthesis.js'
import type { AjnaMergeDecisionState } from '../ajna/ajna-merge-decision.js'
import type { SwarmAgentType } from '../hivemind/hivemind.types.js'

export type TuiPanelId = 'input' | 'stream' | 'tools' | 'swarm' | 'ajna' | 'status'

export interface TuiToolStatus {
  readonly toolName: string
  readonly startedAt: number
  readonly elapsedMs: number
  readonly status: 'running' | 'completed' | 'error'
  readonly output?: string
}

export interface TuiSwarmAgentStatus {
  readonly agentId: string
  readonly agentType: SwarmAgentType
  readonly status: 'idle' | 'active' | 'completed' | 'failed'
  readonly task?: string
  readonly progress?: string
}

export interface TuiAjnaStatus {
  readonly active: boolean
  readonly riskLevel: AjnaRiskLevel | undefined
  readonly mergeDecision: AjnaMergeDecisionState | undefined
  readonly findings: readonly string[]
  readonly lastReviewedAt: string | undefined
}

export interface TuiSessionInfo {
  readonly sessionId: string
  readonly model: string
  readonly tokenCount: number
  readonly costEstimate: number
  readonly startedAt: string
}

export interface TuiState {
  readonly mode: 'interactive' | 'oneshot' | 'batch'
  readonly streaming: boolean
  readonly streamBuffer: string
  readonly activeTools: readonly TuiToolStatus[]
  readonly swarmAgents: readonly TuiSwarmAgentStatus[]
  readonly ajna: TuiAjnaStatus
  readonly session: TuiSessionInfo
  readonly approvalPending: boolean
  readonly approvalPrompt: string | undefined
}

export function createInitialTuiState(
  sessionId: string,
  model: string,
  mode: TuiState['mode'],
): TuiState {
  return {
    mode,
    streaming: false,
    streamBuffer: '',
    activeTools: [],
    swarmAgents: [],
    ajna: {
      active: false,
      riskLevel: undefined,
      mergeDecision: undefined,
      findings: [],
      lastReviewedAt: undefined,
    },
    session: {
      sessionId,
      model,
      tokenCount: 0,
      costEstimate: 0,
      startedAt: new Date().toISOString(),
    },
    approvalPending: false,
    approvalPrompt: undefined,
  }
}
