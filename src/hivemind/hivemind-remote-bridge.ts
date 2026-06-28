import type {
  SwarmAgentType,
  SwarmTask,
  SwarmDispatchResult,
  SwarmAuditReceipt,
} from './hivemind.types.js'

export type HiveMindTransport = 'local' | 'stdio' | 'http'

export interface HiveMindRemoteConfig {
  readonly transport: HiveMindTransport
  readonly endpoint?: string
  readonly timeoutMs: number
  readonly maxConcurrentAgents: number
}

export interface HiveMindRemoteStatus {
  readonly connected: boolean
  readonly transport: HiveMindTransport
  readonly availableAgentTypes: readonly SwarmAgentType[]
  readonly activeAgents: number
  readonly lastHeartbeat?: string
}

export interface HiveMindRemoteDispatchRequest {
  readonly taskId: string
  readonly agentType: SwarmAgentType
  readonly goal: string
  readonly input: Record<string, unknown>
  readonly workspacePath: string
  readonly timeoutMs?: number
}

export interface HiveMindRemoteDispatchResponse {
  readonly taskId: string
  readonly status: 'completed' | 'failed' | 'timeout'
  readonly output: string
  readonly error?: string
  readonly auditReceipt: SwarmAuditReceipt
}

const DEFAULT_REMOTE_CONFIG: HiveMindRemoteConfig = {
  transport: 'local',
  timeoutMs: 300_000,
  maxConcurrentAgents: 5,
}

export class HiveMindRemoteBridge {
  private readonly config: HiveMindRemoteConfig
  private readonly activeTasks = new Map<string, SwarmTask>()

  constructor(config: HiveMindRemoteConfig = DEFAULT_REMOTE_CONFIG) {
    this.config = config
  }

  getStatus(): HiveMindRemoteStatus {
    return {
      connected: this.config.transport === 'local',
      transport: this.config.transport,
      availableAgentTypes:
        this.config.transport === 'local'
          ? ['investigator', 'reporter', 'analyzer', 'coder', 'reviewer']
          : [],
      activeAgents: this.activeTasks.size,
      ...(this.config.transport === 'local' ? { lastHeartbeat: new Date().toISOString() } : {}),
    }
  }

  async dispatch(request: HiveMindRemoteDispatchRequest): Promise<HiveMindRemoteDispatchResponse> {
    if (this.activeTasks.size >= this.config.maxConcurrentAgents) {
      return {
        taskId: request.taskId,
        status: 'failed',
        output: '',
        error: `Maximum concurrent agents (${this.config.maxConcurrentAgents}) reached`,
        auditReceipt: this.createAuditReceipt(request, 0),
      }
    }

    const task: SwarmTask = {
      taskId: request.taskId,
      goal: request.goal,
      agentType: request.agentType,
      input: request.input,
      status: 'running',
      startedAt: new Date().toISOString(),
    }

    this.activeTasks.set(request.taskId, task)

    try {
      if (this.config.transport === 'local') {
        return await this.dispatchLocal(request)
      }

      return {
        taskId: request.taskId,
        status: 'failed',
        output: '',
        error: `Remote transport "${this.config.transport}" not yet implemented. Use local transport.`,
        auditReceipt: this.createAuditReceipt(request, 0),
      }
    } finally {
      this.activeTasks.delete(request.taskId)
    }
  }

  private async dispatchLocal(
    request: HiveMindRemoteDispatchRequest,
  ): Promise<HiveMindRemoteDispatchResponse> {
    const startTime = Date.now()

    return {
      taskId: request.taskId,
      status: 'completed',
      output: `[Local dispatch] Task "${request.goal}" routed to ${request.agentType} agent.`,
      auditReceipt: this.createAuditReceipt(request, Date.now() - startTime),
    }
  }

  private createAuditReceipt(
    request: HiveMindRemoteDispatchRequest,
    _durationMs: number,
  ): SwarmAuditReceipt {
    return {
      taskId: request.taskId,
      agentId: `remote-${request.agentType}-${request.taskId}`,
      agentType: request.agentType,
      role: 'researcher',
      toolsUsed: [],
      iterationCount: 0,
      tokenUsage: { inputTokens: 0, outputTokens: 0 },
      timestamp: new Date().toISOString(),
    }
  }

  getActiveTasks(): readonly SwarmTask[] {
    return [...this.activeTasks.values()]
  }

  getConfig(): HiveMindRemoteConfig {
    return this.config
  }

  isRemote(): boolean {
    return this.config.transport !== 'local'
  }

  toDispatchResult(
    response: HiveMindRemoteDispatchResponse,
    durationMs: number,
  ): SwarmDispatchResult {
    return {
      taskId: response.taskId,
      agentId: response.auditReceipt.agentId,
      status: response.status === 'completed' ? 'completed' : 'failed',
      output: response.output,
      durationMs,
      auditReceipt: response.auditReceipt,
    }
  }
}
