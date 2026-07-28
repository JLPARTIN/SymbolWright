import type { ProviderMessage, ProviderTokenUsage } from '../provider/provider.types.js'

export const AGENT_LOOP_STATUSES = [
  'completed',
  'tool_use_limit',
  'error',
  'cancelled',
  'budget_exceeded',
] as const
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

/**
 * Injected budget-enforcement hook, checked before every provider call. Deliberately kept free of
 * `bigint`/cost-math concerns in `agent-loop.ts` itself -- the governor (constructed by the HTTP
 * layer from the durable governance store, see `src/access/governance-store.ts`) owns estimating
 * and reconciling cost; the loop only calls `reserve`/`settle` around each call. This runs at the
 * provider-turn boundary (once per loop iteration, i.e. once per provider call), not just once
 * per autonomous task, since one task can contain multiple iterations/provider calls.
 */
export interface AgentLoopUsageGovernor {
  /** Called before each provider call with the model that will be used, if pinned. Returning
   * `allowed: false` stops the loop before the call is made -- the loop returns
   * `status: 'budget_exceeded'` without starting it. */
  reserve(context: {
    readonly model?: string
  }): Promise<
    | { readonly allowed: true; readonly reservationId: string }
    | { readonly allowed: false; readonly reason: string }
  >
  /** Reconciles a reservation against actual reported usage after the call completes.
   * `usage` omitted means the provider call failed before reporting usage -- the governor is
   * expected to settle conservatively (retain the full reservation) rather than assume zero
   * cost, matching the governance store's own `settleReservation` contract. */
  settle(reservationId: string, usage?: ProviderTokenUsage, model?: string): Promise<void>
}

export interface AgentLoopConfig {
  readonly maxIterations: number
  readonly systemPrompt: string
  readonly model?: string
  readonly maxTokens?: number
  readonly temperature?: number
  readonly priorMessages?: readonly ProviderMessage[]
  /** Checked at the top of every iteration -- when already aborted, the loop returns immediately
   * with `status: 'cancelled'` without starting a new provider call, preserving whatever
   * `totalUsage`/`finalMessages` were accumulated so far. Does **not** abort an already-in-flight
   * `provider.complete()` call -- no provider adapter threads a signal into its underlying SDK
   * request yet, so a call that's already started runs to its own natural completion. This is a
   * deliberate smallest-viable-increment boundary: it stops the *next* iteration promptly without
   * the larger, separate change of threading `AbortSignal` into every provider adapter. */
  readonly signal?: AbortSignal
  /** Optional budget-enforcement hook. Absent means unlimited, matching every other optional
   * limit in this codebase -- existing callers are entirely unaffected. */
  readonly usageGovernor?: AgentLoopUsageGovernor
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
  /**
   * The full message history built up over the run (prior messages, the new
   * user turn, and every assistant/tool_result message the loop produced —
   * including the final assistant text message on a `completed` run). Pass
   * this back as `priorMessages` on the next call to continue the
   * conversation with tool-call context intact. Always populated by
   * `runAgentLoop`; optional only so existing fixtures that construct a
   * partial `AgentLoopResult` don't need updating.
   */
  readonly finalMessages?: readonly ProviderMessage[]
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
