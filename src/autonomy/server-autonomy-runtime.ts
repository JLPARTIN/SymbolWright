import type { MissionService } from '../mission/mission-service.js'
import type { ProviderGatewayEnv } from '../providers/provider-config.js'
import { ProviderRuntimeOverrideStore } from '../providers/provider-runtime-overrides.js'
import type { SandboxRunner } from '../runtime/sandbox/sandbox-runner.js'
import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'
import { createMissionAutonomyEditExecutor } from '../server/mission-autonomy-edit-executor.js'
import {
  createAutonomousMissionRuntime,
  type AutonomousMissionRuntime,
} from './autonomous-mission-runtime.js'
import type {
  MissionTaskExecutionResult,
  MissionTaskExecutor,
} from './persistent-mission-executor.js'
import { RuntimeAutonomousValidationRunner } from './runtime-validation-runner.js'
import {
  RuntimeMissionTaskExecutor,
  type AutonomousEditTaskExecutor,
} from './runtime-mission-task-executor.js'
import type { AutonomousTaskGraph, AutonomousTaskNode } from './task-graph.types.js'

export const DEFAULT_AUTONOMOUS_VALIDATION_COMMANDS = [
  'npm run typecheck',
  'npm run lint',
  'npm test',
  'npm run build',
] as const

export interface ServerAutonomyRuntimeOptions {
  readonly workspaceRoot: string
  readonly missionService: MissionService
  readonly hasGitHubToken: boolean
  readonly sandboxRunner?: SandboxRunner
  readonly editExecutor?: AutonomousEditTaskExecutor
  readonly validationCommands?: readonly string[]
  readonly env?: ProviderGatewayEnv
  readonly overrideStore?: ProviderRuntimeOverrideStore
}

/**
 * Assembles the live server autonomy runtime. Before execution starts, the
 * task adapter binds itself to the mission's repository, runtime mode,
 * persisted provider, model, and tool-capable agent loop.
 */
export function createServerAutonomyRuntime(
  options: ServerAutonomyRuntimeOptions,
): AutonomousMissionRuntime {
  const taskExecutor = new MissionBoundTaskExecutor(options)

  return createAutonomousMissionRuntime({
    workspaceRoot: options.workspaceRoot,
    missionService: options.missionService,
    taskExecutor,
    validationCommands: options.validationCommands ?? DEFAULT_AUTONOMOUS_VALIDATION_COMMANDS,
  })
}

class MissionBoundTaskExecutor implements MissionTaskExecutor {
  readonly #options: ServerAutonomyRuntimeOptions
  readonly #env: ProviderGatewayEnv
  readonly #overrideStore: ProviderRuntimeOverrideStore
  #delegate: RuntimeMissionTaskExecutor | undefined

  constructor(options: ServerAutonomyRuntimeOptions) {
    this.#options = options
    this.#env = options.env ?? process.env
    this.#overrideStore = options.overrideStore ?? new ProviderRuntimeOverrideStore()
  }

  prepare(graph: AutonomousTaskGraph): void {
    const mission = this.#options.missionService.get(graph.missionId)
    const policy = createRuntimePolicyForMode(mission.agent.runtimeMode, {
      hasGitHubToken: this.#options.hasGitHubToken,
    })
    const validationRunner = new RuntimeAutonomousValidationRunner({
      policy,
      reason: 'Autonomous mission validation',
      ...(this.#options.sandboxRunner === undefined
        ? {}
        : { sandboxRunner: this.#options.sandboxRunner }),
    })
    const validationCommands =
      this.#options.validationCommands ?? DEFAULT_AUTONOMOUS_VALIDATION_COMMANDS
    const editExecutor =
      this.#options.editExecutor ??
      createMissionAutonomyEditExecutor({
        mission,
        env: this.#env,
        overrideStore: this.#overrideStore,
        workspaceRoot: this.#options.workspaceRoot,
        validationCommands,
      })

    this.#delegate = new RuntimeMissionTaskExecutor({
      repositoryRoot: mission.repository.rootPath,
      validationRunner,
      ...(editExecutor === undefined ? {} : { editExecutor }),
    })
  }

  async execute(task: AutonomousTaskNode): Promise<MissionTaskExecutionResult> {
    if (this.#delegate === undefined) {
      throw new Error('Autonomous task executor was not prepared for a mission.')
    }
    return this.#delegate.execute(task)
  }
}
