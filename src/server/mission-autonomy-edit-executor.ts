import { AgentLoopAutonomousEditExecutor } from '../autonomy/agent-loop-edit-executor.js'
import type { AutonomousEditTaskExecutor } from '../autonomy/runtime-mission-task-executor.js'
import type { CodeMindMission } from '../mission/mission-types.js'
import {
  CODEMIND_SUPPORTED_PROVIDER_IDS,
  type CodemindProviderId,
} from '../providers/provider-adapter-contract.js'
import { loadProviderGatewayConfig, type ProviderGatewayEnv } from '../providers/provider-config.js'
import {
  applyProviderRuntimeOverrides,
  type ProviderRuntimeOverrideStore,
} from '../providers/provider-runtime-overrides.js'
import { assembleAgentTools } from '../runtime/tools/tool-assembly.js'
import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'
import type { RuntimeToolContext } from '../runtime/types.js'
import { resolveAgentLlmProvider } from './codemind-agent-provider.js'

export interface MissionAutonomyEditExecutorOptions {
  readonly mission: CodeMindMission
  readonly env: ProviderGatewayEnv
  readonly overrideStore: ProviderRuntimeOverrideStore
}

/**
 * Builds the real tool-capable edit executor for an autonomous mission from
 * the provider and model already persisted on that mission.
 */
export function createMissionAutonomyEditExecutor(
  options: MissionAutonomyEditExecutorOptions,
): AutonomousEditTaskExecutor | undefined {
  const providerId = options.mission.agent.activeProviderId
  // Preserve blocked write-task behavior until the operator selects a real provider.
  if (providerId === undefined) return undefined
  if (!(CODEMIND_SUPPORTED_PROVIDER_IDS as readonly string[]).includes(providerId)) {
    throw new Error(`Unsupported mission provider: ${providerId}`)
  }

  const typedProviderId = providerId as CodemindProviderId
  const config = applyProviderRuntimeOverrides(
    loadProviderGatewayConfig(options.env),
    options.overrideStore.snapshot(),
  ).providers[typedProviderId]
  if (config === undefined) throw new Error(`Unknown mission provider: ${providerId}`)

  const repositoryRoot = options.mission.repository.rootPath
  const policy = createRuntimePolicyForMode(options.mission.agent.runtimeMode, {
    hasGitHubToken: options.env['GITHUB_TOKEN'] !== undefined,
  })
  const toolContext: RuntimeToolContext = {
    cwd: repositoryRoot,
    policy,
    sessionId: options.mission.id,
  }

  return new AgentLoopAutonomousEditExecutor({
    provider: resolveAgentLlmProvider(config),
    tools: assembleAgentTools(),
    toolContext,
    repositoryRoot,
    ...(options.mission.agent.model === undefined ? {} : { model: options.mission.agent.model }),
  })
}
