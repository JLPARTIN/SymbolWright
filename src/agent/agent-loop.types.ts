import type { ProviderTokenUsage } from '../provider/provider.types.js'

export const AGENT_LOOP_STATUSES = ['completed', 'tool_use_limit', 'error'] as const
export type AgentLoopStatus = (typeof AGENT_LOOP_STATUSES)[number]

export const AGENT_LOOP_EVENT_TYPES = [
  'text_delta',
  'tool_call_start',
  'tool_call_end',
  'iteration_start',
  'iteration_end',
  'loop_end',
  'error',
] as const
export type AgentLoopEventType = (typeof AGENT_LOOP_EVENT_TYPES)[number]

export interface AgentLoopConfig {
  readonly maxIterations: number
  readonly systemPrompt: string
  readonly model?: string
  readonly maxTokens?: number
  readonly temperature?: number
}

export interface AgentLoopToolCall {
  readonly id: string
  readonly name: string
  readonly input: Record<string, unknown>
}

export interface AgentLoopToolResult {
  readonly toolUseId: string
  readonly name: string
  readonly output: string
  readonly isError: boolean
  readonly durationMs: number
}

export interface AgentLoopIteration {
  readonly iterationNumber: number
  readonly toolCalls: readonly AgentLoopToolCall[]
  readonly toolResults: readonly AgentLoopToolResult[]
  readonly textResponse?: string
  readonly usage?: ProviderTokenUsage
}

export interface AgentLoopResult {
  readonly status: AgentLoopStatus
  readonly finalText: string
  readonly iterations: readonly AgentLoopIteration[]
  readonly totalIterations: number
  readonly totalUsage: ProviderTokenUsage
  readonly error?: string
}

export interface AgentLoopTextDeltaEvent {
  readonly type: 'text_delta'
  readonly text: string
}

export interface AgentLoopToolCallStartEvent {
  readonly type: 'tool_call_start'
  readonly id: string
  readonly name: string
}

export interface AgentLoopToolCallEndEvent {
  readonly type: 'tool_call_end'
  readonly id: string
  readonly name: string
  readonly output: string
  readonly isError: boolean
  readonly durationMs: number
}

export interface AgentLoopIterationStartEvent {
  readonly type: 'iteration_start'
  readonly iterationNumber: number
}

export interface AgentLoopIterationEndEvent {
  readonly type: 'iteration_end'
  readonly iterationNumber: number
  readonly usage?: ProviderTokenUsage
}

export interface AgentLoopEndEvent {
  readonly type: 'loop_end'
  readonly status: AgentLoopStatus
  readonly totalIterations: number
}

export interface AgentLoopErrorEvent {
  readonly type: 'error'
  readonly error: string
}

export type AgentLoopEvent =
  | AgentLoopTextDeltaEvent
  | AgentLoopToolCallStartEvent
  | AgentLoopToolCallEndEvent
  | AgentLoopIterationStartEvent
  | AgentLoopIterationEndEvent
  | AgentLoopEndEvent
  | AgentLoopErrorEvent
