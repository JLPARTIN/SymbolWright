import type { LLMProvider } from '../provider/provider.types.js'
import type { RuntimeToolDefinition, RuntimeToolContext, RuntimePolicySnapshot } from '../runtime/types.js'
import { runAgentLoop } from '../agent/agent-loop.js'
import type { AgentLoopConfig } from '../agent/agent-loop.types.js'
import { buildSystemPrompt } from '../conversation/system-prompt-builder.js'
import type { HiveMindRegistry } from './hivemind-registry.js'
import type {
  SwarmAgentType,
  SwarmTask,
  SwarmDispatchResult,
  SwarmAuditReceipt,
} from './hivemind.types.js'

export interface SwarmDispatchRequest {
  readonly taskId: string
  readonly goal: string
  readonly agentType: SwarmAgentType
  readonly input: Record<string, unknown>
  readonly maxIterations?: number
}

function buildSwarmPolicy(
  parentPolicy: RuntimePolicySnapshot,
  canWrite: boolean,
  canExecuteCommands: boolean,
): RuntimePolicySnapshot {
  return {
    mode: canWrite ? 'APPROVED_EXECUTION' : 'READ_ONLY',
    allowNetwork: parentPolicy.allowNetwork,
    allowShell: canExecuteCommands && parentPolicy.allowShell,
    allowWrites: canWrite && parentPolicy.allowWrites,
    allowGitHubWrites: false,
    protectedPaths: parentPolicy.protectedPaths,
    noisyDirs: parentPolicy.noisyDirs,
  }
}

export class HiveMindDispatcher {
  constructor(
    private readonly registry: HiveMindRegistry,
    private readonly provider: LLMProvider,
    private readonly tools: readonly RuntimeToolDefinition[],
    private readonly baseContext: RuntimeToolContext,
    private readonly baseSystemPrompt: string,
  ) {}

  async dispatch(request: SwarmDispatchRequest): Promise<SwarmDispatchResult> {
    const agent = this.registry.createAgent(request.agentType)
    if (agent === undefined) {
      return {
        taskId: request.taskId,
        agentId: 'unknown',
        status: 'failed',
        output: `Unknown agent type: ${request.agentType}`,
        durationMs: 0,
        auditReceipt: this.emptyReceipt(request),
      }
    }

    const config = this.registry.getConfig(request.agentType)
    if (config === undefined) {
      return {
        taskId: request.taskId,
        agentId: agent.agentId,
        status: 'failed',
        output: `No configuration for agent type: ${request.agentType}`,
        durationMs: 0,
        auditReceipt: this.emptyReceipt(request),
      }
    }

    const swarmPolicy = buildSwarmPolicy(
      this.baseContext.policy,
      config.capabilities.canWrite,
      config.capabilities.canExecuteCommands,
    )

    const swarmContext: RuntimeToolContext = {
      cwd: this.baseContext.cwd,
      policy: swarmPolicy,
      ...(this.baseContext.approval !== undefined ? { approval: this.baseContext.approval } : {}),
    }

    const systemPrompt = `${this.baseSystemPrompt}\n\n${config.systemPromptSuffix}`

    const loopConfig: AgentLoopConfig = {
      maxIterations: request.maxIterations ?? 20,
      systemPrompt,
    }

    const startTime = Date.now()
    const result = await runAgentLoop(
      this.provider,
      request.goal,
      this.tools,
      swarmContext,
      loopConfig,
    )
    const durationMs = Date.now() - startTime

    const auditReceipt: SwarmAuditReceipt = {
      taskId: request.taskId,
      agentId: agent.agentId,
      agentType: request.agentType,
      role: agent.role,
      toolsUsed: result.iterations.flatMap((iter) =>
        iter.toolCalls.map((call) => call.name),
      ),
      iterationCount: result.totalIterations,
      tokenUsage: {
        inputTokens: result.totalUsage.inputTokens,
        outputTokens: result.totalUsage.outputTokens,
      },
      timestamp: new Date().toISOString(),
    }

    return {
      taskId: request.taskId,
      agentId: agent.agentId,
      status: result.status === 'completed' ? 'completed' : 'failed',
      output: result.finalText,
      durationMs,
      auditReceipt,
    }
  }

  private emptyReceipt(request: SwarmDispatchRequest): SwarmAuditReceipt {
    return {
      taskId: request.taskId,
      agentId: 'unknown',
      agentType: request.agentType,
      role: 'researcher',
      toolsUsed: [],
      iterationCount: 0,
      tokenUsage: { inputTokens: 0, outputTokens: 0 },
      timestamp: new Date().toISOString(),
    }
  }
}
