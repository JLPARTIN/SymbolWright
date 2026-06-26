import type { AgentKernelRole } from '../kernel/agent-kernel.types.js'

export const SWARM_AGENT_TYPES = [
  'investigator',
  'reporter',
  'analyzer',
  'coder',
  'reviewer',
] as const
export type SwarmAgentType = (typeof SWARM_AGENT_TYPES)[number]

export const SWARM_AGENT_STATUSES = ['idle', 'active', 'completed', 'failed'] as const
export type SwarmAgentStatus = (typeof SWARM_AGENT_STATUSES)[number]

export const SWARM_TASK_STATUSES = ['pending', 'dispatched', 'running', 'completed', 'failed'] as const
export type SwarmTaskStatus = (typeof SWARM_TASK_STATUSES)[number]

export interface SwarmAgentCapabilities {
  readonly toolCategories: readonly string[]
  readonly canRead: boolean
  readonly canWrite: boolean
  readonly canExecuteCommands: boolean
  readonly canReview: boolean
}

export interface SwarmAgent {
  readonly agentId: string
  readonly agentType: SwarmAgentType
  readonly role: AgentKernelRole
  readonly status: SwarmAgentStatus
  readonly capabilities: SwarmAgentCapabilities
}

export interface SwarmTask {
  readonly taskId: string
  readonly goal: string
  readonly agentType: SwarmAgentType
  readonly input: Record<string, unknown>
  readonly status: SwarmTaskStatus
  readonly result?: string
  readonly error?: string
  readonly startedAt?: string
  readonly completedAt?: string
}

export interface SwarmDispatchResult {
  readonly taskId: string
  readonly agentId: string
  readonly status: SwarmTaskStatus
  readonly output: string
  readonly durationMs: number
  readonly auditReceipt: SwarmAuditReceipt
}

export interface SwarmAuditReceipt {
  readonly taskId: string
  readonly agentId: string
  readonly agentType: SwarmAgentType
  readonly role: AgentKernelRole
  readonly toolsUsed: readonly string[]
  readonly iterationCount: number
  readonly tokenUsage: {
    readonly inputTokens: number
    readonly outputTokens: number
  }
  readonly timestamp: string
}
