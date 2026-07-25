import type { RuntimeToolDefinition, RuntimeToolContext } from '../types.js'
import { SWARM_AGENT_TYPES, type SwarmAgentType } from '../../hivemind/hivemind.types.js'
import type { SwarmDispatchResult } from '../../hivemind/hivemind.types.js'
import type {
  HiveMindDispatcher,
  SwarmDispatchRequest,
} from '../../hivemind/hivemind-dispatcher.js'

export interface SwarmDispatchToolInput {
  readonly agentType: SwarmAgentType
  readonly goal: string
  readonly context?: string
}

export function parseSwarmDispatchInput(input: unknown): SwarmDispatchToolInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing input: swarm_dispatch requires agentType and goal')
  }
  const raw = input as Record<string, unknown>

  if (typeof raw['agentType'] !== 'string') {
    throw new Error(`Missing agentType. Valid types: ${SWARM_AGENT_TYPES.join(', ')}`)
  }

  const agentType = raw['agentType'] as string
  if (!SWARM_AGENT_TYPES.includes(agentType as SwarmAgentType)) {
    throw new Error(`Invalid agentType "${agentType}". Valid: ${SWARM_AGENT_TYPES.join(', ')}`)
  }

  if (typeof raw['goal'] !== 'string' || raw['goal'].length === 0) {
    throw new Error('Missing or empty goal')
  }

  return {
    agentType: agentType as SwarmAgentType,
    goal: raw['goal'],
    ...(typeof raw['context'] === 'string' ? { context: raw['context'] } : {}),
  }
}

export function createWiredSwarmDispatchTool(
  dispatcher: HiveMindDispatcher,
  onResult?: (result: SwarmDispatchResult) => void,
): RuntimeToolDefinition {
  return {
    name: 'swarm_dispatch',
    description: `Dispatch a task to a specialized swarm agent. Types: ${SWARM_AGENT_TYPES.join(', ')}. Returns the agent's output.`,
    capability: 'APPROVED_COMMAND',
    execute: async (input: unknown, _context: RuntimeToolContext): Promise<string> => {
      const parsed = parseSwarmDispatchInput(input)

      const request: SwarmDispatchRequest = {
        taskId: `swarm-${Date.now()}`,
        goal: parsed.goal,
        agentType: parsed.agentType,
        input: parsed.context !== undefined ? { context: parsed.context } : {},
      }

      const result = await dispatcher.dispatch(request)
      onResult?.(result)

      return [
        'SymbolWright swarm dispatch',
        '',
        `Agent: ${result.agentId} (${parsed.agentType})`,
        `Status: ${result.status.toUpperCase()}`,
        `Duration: ${result.durationMs}ms`,
        '',
        result.output,
      ].join('\n')
    },
  }
}

export const swarmDispatchTool: RuntimeToolDefinition = {
  name: 'swarm_dispatch',
  description: `Dispatch a task to a specialized swarm agent. Types: ${SWARM_AGENT_TYPES.join(', ')}. Returns the agent's output.`,
  capability: 'APPROVED_COMMAND',
  execute: async (input: unknown, _context: RuntimeToolContext): Promise<string> => {
    const parsed = parseSwarmDispatchInput(input)

    return [
      'SymbolWright swarm dispatch',
      '',
      `Agent type: ${parsed.agentType}`,
      `Goal: ${parsed.goal}`,
      ...(parsed.context !== undefined ? [`Context: ${parsed.context}`] : []),
      '',
      'Status: QUEUED',
      'Note: Swarm dispatch requires an active HiveMind dispatcher instance.',
      'Use createWiredSwarmDispatchTool() to enable live dispatch.',
    ].join('\n')
  },
}
