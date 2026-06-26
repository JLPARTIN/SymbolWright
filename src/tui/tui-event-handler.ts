import type { AgentLoopEvent } from '../agent/agent-loop.types.js'
import type { AjnaLiveReviewResult } from '../ajna/ajna-live-review.js'
import type { SwarmAgentType, SwarmAgentStatus } from '../hivemind/hivemind.types.js'
import type {
  TuiState,
  TuiToolStatus,
  TuiSwarmAgentStatus,
  TuiAjnaStatus,
} from './tui.types.js'

export type TuiEvent =
  | { readonly type: 'agent_loop_event'; readonly event: AgentLoopEvent }
  | { readonly type: 'ajna_review'; readonly result: AjnaLiveReviewResult }
  | { readonly type: 'swarm_dispatch'; readonly agentId: string; readonly agentType: SwarmAgentType; readonly task: string }
  | { readonly type: 'swarm_complete'; readonly agentId: string; readonly status: SwarmAgentStatus }
  | { readonly type: 'approval_request'; readonly prompt: string }
  | { readonly type: 'approval_response'; readonly approved: boolean }
  | { readonly type: 'token_update'; readonly tokenCount: number; readonly costEstimate: number }

export function applyTuiEvent(state: TuiState, event: TuiEvent): TuiState {
  switch (event.type) {
    case 'agent_loop_event':
      return applyAgentLoopEvent(state, event.event)
    case 'ajna_review':
      return applyAjnaReview(state, event.result)
    case 'swarm_dispatch':
      return applySwarmDispatch(state, event.agentId, event.agentType, event.task)
    case 'swarm_complete':
      return applySwarmComplete(state, event.agentId, event.status)
    case 'approval_request':
      return { ...state, approvalPending: true, approvalPrompt: event.prompt }
    case 'approval_response':
      return { ...state, approvalPending: false, approvalPrompt: undefined }
    case 'token_update':
      return {
        ...state,
        session: {
          ...state.session,
          tokenCount: event.tokenCount,
          costEstimate: event.costEstimate,
        },
      }
  }
}

function applyAgentLoopEvent(state: TuiState, event: AgentLoopEvent): TuiState {
  switch (event.type) {
    case 'text_delta':
      return {
        ...state,
        streaming: true,
        streamBuffer: state.streamBuffer + event.text,
      }

    case 'tool_call_start': {
      const newTool: TuiToolStatus = {
        toolName: event.name,
        startedAt: Date.now(),
        elapsedMs: 0,
        status: 'running',
      }
      return {
        ...state,
        activeTools: [...state.activeTools, newTool],
      }
    }

    case 'tool_call_end': {
      const updatedTools = state.activeTools.map((tool) =>
        tool.toolName === event.name && tool.status === 'running'
          ? {
              ...tool,
              status: (event.isError ? 'error' : 'completed') as TuiToolStatus['status'],
              elapsedMs: event.durationMs,
              ...(event.output.length > 0 ? { output: event.output.substring(0, 200) } : {}),
            }
          : tool,
      )
      return { ...state, activeTools: updatedTools }
    }

    case 'iteration_end':
      return {
        ...state,
        streaming: false,
        activeTools: state.activeTools.filter((t) => t.status === 'running'),
      }

    case 'loop_end':
      return {
        ...state,
        streaming: false,
        activeTools: [],
      }

    case 'error':
      return state

    case 'iteration_start':
      return { ...state, streamBuffer: '' }
  }
}

function applyAjnaReview(state: TuiState, result: AjnaLiveReviewResult): TuiState {
  const ajnaStatus: TuiAjnaStatus = {
    active: true,
    riskLevel: result.riskLevel,
    mergeDecision: result.mergeDecision,
    findings: result.findings,
    lastReviewedAt: new Date().toISOString(),
  }
  return { ...state, ajna: ajnaStatus }
}

function applySwarmDispatch(
  state: TuiState,
  agentId: string,
  agentType: SwarmAgentType,
  task: string,
): TuiState {
  const newAgent: TuiSwarmAgentStatus = {
    agentId,
    agentType,
    status: 'active',
    task,
  }
  return {
    ...state,
    swarmAgents: [...state.swarmAgents, newAgent],
  }
}

function applySwarmComplete(
  state: TuiState,
  agentId: string,
  status: SwarmAgentStatus,
): TuiState {
  const updatedAgents = state.swarmAgents.map((agent) =>
    agent.agentId === agentId
      ? { ...agent, status: status as TuiSwarmAgentStatus['status'] }
      : agent,
  )
  return { ...state, swarmAgents: updatedAgents }
}
