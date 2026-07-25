import path from 'node:path'

import { AgentLoopAutonomousEditExecutor } from '../autonomy/agent-loop-edit-executor.js'
import { RepositorySemanticIndexStore } from '../autonomy/repository-semantic-index-store.js'
import type { AutonomousEditTaskExecutor } from '../autonomy/runtime-mission-task-executor.js'
import { TransactionalRepositoryEdit } from '../autonomy/transactional-repository-edit.js'
import type { SymbolWrightMission } from '../mission/mission-types.js'
import {
  SYMBOLWRIGHT_SUPPORTED_PROVIDER_IDS,
  type SymbolWrightProviderId,
} from '../providers/provider-adapter-contract.js'
import { loadProviderGatewayConfig, type ProviderGatewayEnv } from '../providers/provider-config.js'
import {
  applyProviderRuntimeOverrides,
  type ProviderRuntimeOverrideStore,
} from '../providers/provider-runtime-overrides.js'
import { assembleAgentTools } from '../runtime/tools/tool-assembly.js'
import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'
import type { RuntimeToolContext } from '../runtime/types.js'
import { resolveAgentLlmProvider } from './symbolwright-agent-provider.js'

export interface MissionAutonomyEditExecutorOptions {
  readonly mission: SymbolWrightMission
  readonly env: ProviderGatewayEnv
  readonly overrideStore: ProviderRuntimeOverrideStore
  readonly workspaceRoot?: string
  readonly validationCommands?: readonly string[]
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
  if (!(SYMBOLWRIGHT_SUPPORTED_PROVIDER_IDS as readonly string[]).includes(providerId)) {
    throw new Error(`Unsupported mission provider: ${providerId}`)
  }

  const typedProviderId = providerId as SymbolWrightProviderId
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
    untrustedRepositoryContent: options.mission.labels.includes('external-repository'),
  }
  const semanticIndexStore =
    options.workspaceRoot === undefined
      ? undefined
      : new RepositorySemanticIndexStore(
          path.join(path.resolve(options.workspaceRoot), '.symbolwright'),
        )

  return new AgentLoopAutonomousEditExecutor({
    provider: resolveAgentLlmProvider(config),
    tools: assembleAgentTools(),
    toolContext,
    repositoryRoot,
    transactionManager: new TransactionalRepositoryEdit({ repositoryRoot }),
    ...(semanticIndexStore === undefined
      ? {}
      : {
          loadSemanticIndex: () => semanticIndexStore.load(repositoryRoot),
        }),
    ...(options.validationCommands === undefined
      ? {}
      : { validationCommands: options.validationCommands }),
    ...(options.mission.agent.model === undefined ? {} : { model: options.mission.agent.model }),
  })
}
