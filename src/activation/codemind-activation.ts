import type { LLMProvider } from '../provider/provider.types.js'
import type { RuntimeToolDefinition, RuntimeToolContext } from '../runtime/types.js'
import type { AgentLoopConfig, AgentLoopEvent, AgentLoopResult } from '../agent/agent-loop.types.js'
import { runAgentLoop } from '../agent/agent-loop.js'
import { HiveMindRegistry } from '../hivemind/hivemind-registry.js'
import { HiveMindDispatcher, type SwarmDispatchRequest } from '../hivemind/hivemind-dispatcher.js'
import type { SwarmDispatchResult } from '../hivemind/hivemind.types.js'
import { SWARM_AGENT_TYPES } from '../hivemind/hivemind.types.js'
import { buildUnifiedSystemPrompt, type UnifiedPromptContext } from '../conversation/unified-system-prompt.js'
import type { TuiState } from '../tui/tui.types.js'
import { createInitialTuiState } from '../tui/tui.types.js'
import { applyTuiEvent } from '../tui/tui-event-handler.js'
import type { TuiEvent } from '../tui/tui-event-handler.js'
import { runAjnaLiveReview, type AjnaLiveReviewInput, type AjnaLiveReviewResult } from '../ajna/ajna-live-review.js'
import { evaluateAjnaMergeGate, type AjnaMergeGateResult } from '../ajna/ajna-merge-gate.js'
import { createWiredSwarmDispatchTool } from '../runtime/tools/swarm-dispatch-tool.js'

export interface CodemindActivationConfig {
  readonly provider: LLMProvider
  readonly tools: readonly RuntimeToolDefinition[]
  readonly toolContext: RuntimeToolContext
  readonly promptContext?: UnifiedPromptContext
  readonly sessionId?: string
  readonly maxIterations?: number
  readonly onEvent?: (event: AgentLoopEvent) => void
  readonly onTuiUpdate?: (state: TuiState) => void
}

export interface CodemindActivationResult {
  readonly agentResult: AgentLoopResult
  readonly swarmDispatches: readonly SwarmDispatchResult[]
  readonly ajnaReviews: readonly AjnaLiveReviewResult[]
  readonly tuiState: TuiState
}

export interface CodemindSubsystems {
  readonly provider: LLMProvider
  readonly registry: HiveMindRegistry
  readonly dispatcher: HiveMindDispatcher
  readonly systemPrompt: string
  readonly tuiState: TuiState
  readonly tools: readonly RuntimeToolDefinition[]
  readonly toolContext: RuntimeToolContext
}

export function activateSubsystems(config: CodemindActivationConfig): CodemindSubsystems {
  const sessionId = config.sessionId ?? `cm-${Date.now()}`
  const registry = new HiveMindRegistry()

  const promptContext: UnifiedPromptContext = {
    swarmAgentTypes: [...SWARM_AGENT_TYPES],
    permissionMode: config.toolContext.policy.mode,
    ...config.promptContext,
  }
  const systemPrompt = buildUnifiedSystemPrompt(promptContext)

  const dispatcher = new HiveMindDispatcher(
    registry,
    config.provider,
    config.tools,
    config.toolContext,
    systemPrompt,
  )

  const tuiState = createInitialTuiState(
    sessionId,
    config.provider.displayName,
    'interactive',
  )

  return {
    provider: config.provider,
    registry,
    dispatcher,
    systemPrompt,
    tuiState,
    tools: config.tools,
    toolContext: config.toolContext,
  }
}

export async function runActivatedAgent(
  config: CodemindActivationConfig,
  userMessage: string,
): Promise<CodemindActivationResult> {
  const subsystems = activateSubsystems(config)
  const swarmDispatches: SwarmDispatchResult[] = []
  const ajnaReviews: AjnaLiveReviewResult[] = []
  let tuiState = subsystems.tuiState

  const updateTui = (event: TuiEvent): void => {
    tuiState = applyTuiEvent(tuiState, event)
    config.onTuiUpdate?.(tuiState)
  }

  const onEvent = (event: AgentLoopEvent): void => {
    updateTui({ type: 'agent_loop_event', event })
    config.onEvent?.(event)

    if (event.type === 'tool_call_end' && event.name === 'swarm_dispatch' && !event.isError) {
      updateTui({
        type: 'swarm_dispatch',
        agentId: `swarm-${swarmDispatches.length}`,
        agentType: 'investigator',
        task: event.output.substring(0, 200),
      })
    }
  }

  const wiredTools = wireSwarmDispatchTool(
    config.tools,
    subsystems.dispatcher,
    (result) => {
      swarmDispatches.push(result)
      updateTui({
        type: 'swarm_complete',
        agentId: result.agentId,
        status: result.status === 'completed' ? 'completed' : 'failed',
      })
    },
  )

  const loopConfig: AgentLoopConfig = {
    maxIterations: config.maxIterations ?? 50,
    systemPrompt: subsystems.systemPrompt,
  }

  const agentResult = await runAgentLoop(
    subsystems.provider,
    userMessage,
    wiredTools,
    subsystems.toolContext,
    loopConfig,
    onEvent,
  )

  updateTui({
    type: 'token_update',
    tokenCount: agentResult.totalUsage.inputTokens + agentResult.totalUsage.outputTokens,
    costEstimate: estimateCost(agentResult.totalUsage.inputTokens, agentResult.totalUsage.outputTokens),
  })

  return {
    agentResult,
    swarmDispatches,
    ajnaReviews,
    tuiState,
  }
}

export async function dispatchSwarmTask(
  subsystems: CodemindSubsystems,
  request: SwarmDispatchRequest,
  onTuiEvent?: (event: TuiEvent) => void,
): Promise<SwarmDispatchResult> {
  onTuiEvent?.({
    type: 'swarm_dispatch',
    agentId: `swarm-${request.agentType}-pending`,
    agentType: request.agentType,
    task: request.goal,
  })

  const result = await subsystems.dispatcher.dispatch(request)

  onTuiEvent?.({
    type: 'swarm_complete',
    agentId: result.agentId,
    status: result.status === 'completed' ? 'completed' : 'failed',
  })

  return result
}

export async function runAjnaReview(
  input: AjnaLiveReviewInput,
  onTuiEvent?: (event: TuiEvent) => void,
): Promise<AjnaLiveReviewResult> {
  const result = await runAjnaLiveReview(input)

  onTuiEvent?.({
    type: 'ajna_review',
    result,
  })

  return result
}

export async function checkMergeReadiness(
  input: AjnaLiveReviewInput,
): Promise<AjnaMergeGateResult> {
  return evaluateAjnaMergeGate(input)
}

function wireSwarmDispatchTool(
  tools: readonly RuntimeToolDefinition[],
  dispatcher: HiveMindDispatcher,
  onResult: (result: SwarmDispatchResult) => void,
): readonly RuntimeToolDefinition[] {
  const wired = createWiredSwarmDispatchTool(dispatcher, onResult)
  return tools.map((tool) => (tool.name === 'swarm_dispatch' ? wired : tool))
}

function estimateCost(inputTokens: number, outputTokens: number): number {
  const inputCostPer1M = 3.0
  const outputCostPer1M = 15.0
  return (inputTokens * inputCostPer1M + outputTokens * outputCostPer1M) / 1_000_000
}

export function verifySubsystemHealth(subsystems: CodemindSubsystems): SubsystemHealthReport {
  const checks: SubsystemHealthCheck[] = []

  checks.push({
    name: 'Provider',
    healthy: subsystems.provider.providerId.length > 0,
    detail: `${subsystems.provider.displayName} (${subsystems.provider.providerId})`,
  })

  checks.push({
    name: 'Tool Registry',
    healthy: subsystems.tools.length > 0,
    detail: `${subsystems.tools.length} tools registered`,
  })

  const agentTypes = subsystems.registry.listAgentTypes()
  checks.push({
    name: 'HiveMind Registry',
    healthy: agentTypes.length === SWARM_AGENT_TYPES.length,
    detail: `${agentTypes.length}/${SWARM_AGENT_TYPES.length} agent types loaded`,
  })

  checks.push({
    name: 'System Prompt',
    healthy: subsystems.systemPrompt.length > 0,
    detail: `${subsystems.systemPrompt.length} chars`,
  })

  checks.push({
    name: 'TUI State',
    healthy: subsystems.tuiState.session.sessionId.length > 0,
    detail: `Session: ${subsystems.tuiState.session.sessionId}`,
  })

  checks.push({
    name: 'Policy',
    healthy: true,
    detail: `Mode: ${subsystems.toolContext.policy.mode}`,
  })

  const healthy = checks.every((c) => c.healthy)

  return { checks, healthy }
}

export interface SubsystemHealthCheck {
  readonly name: string
  readonly healthy: boolean
  readonly detail: string
}

export interface SubsystemHealthReport {
  readonly checks: readonly SubsystemHealthCheck[]
  readonly healthy: boolean
}
