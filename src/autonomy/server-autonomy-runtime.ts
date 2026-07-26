import type { AccessRuntime } from '../access/access-runtime.js'
import { ProjectMemory, resolveProjectMemoryDir } from '../memory/project-memory.js'
import type { MissionService } from '../mission/mission-service.js'
import type { SymbolWrightMission } from '../mission/mission-types.js'
import { encodePortableValidationInvocation } from '../portability/portable-validation-invocation.js'
import type { PortableValidationRunner } from '../portability/portable-validation-runner.js'
import { researchRepositoryPortability } from '../portability/repository-portability-research.js'
import { discoverUniversalRepositoryPortability } from '../portability/universal-repository-portability.js'
import type { ProviderGatewayEnv } from '../providers/provider-config.js'
import { ProviderRuntimeOverrideStore } from '../providers/provider-runtime-overrides.js'
import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'
import type { SandboxRunner } from '../runtime/sandbox/sandbox-runner.js'
import { createMissionAutonomyEditExecutor } from '../server/mission-autonomy-edit-executor.js'
import type { WebSearchProvider } from '../web/web-search-provider.js'
import {
  createAutonomousMissionRuntime,
  type AutonomousMissionRuntime,
} from './autonomous-mission-runtime.js'
import { JsonAutonomousRepairLoopStore } from './autonomous-repair-loop.js'
import type {
  MissionTaskExecutionResult,
  MissionTaskExecutor,
  MissionTaskRepairInput,
} from './persistent-mission-executor.js'
import { PersistentMissionRepairController } from './persistent-mission-repair-controller.js'
import { RuntimeAutonomousValidationRunner } from './runtime-validation-runner.js'
import {
  RuntimeMissionTaskExecutor,
  type AutonomousEditTaskExecutor,
} from './runtime-mission-task-executor.js'
import type { AutonomousTaskGraph, AutonomousTaskNode } from './task-graph.types.js'

/** Retained for explicit legacy callers; live missions now discover commands per repository. */
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
  readonly portableRunner?: PortableValidationRunner
  readonly editExecutor?: AutonomousEditTaskExecutor
  readonly validationCommands?: readonly string[]
  /** Global fallback repair-attempt cap. When a mission was created by a delegated-access grant
   * (has `grantId`) and `accessRuntime` is supplied, the effective cap is the smaller of this and
   * that grant's `executionLimits.maxRepairAttempts`. */
  readonly maxRepairAttempts?: number
  /** Used to look up a mission's owning grant (via `mission.grantId`) to source a per-grant
   * `executionLimits.maxRepairAttempts`/`maxMissionDurationMinutes`. Absent for
   * local-operator-only deployments. */
  readonly accessRuntime?: AccessRuntime
  /** Global fallback mission-duration cap (minutes); see `accessRuntime` for the per-grant
   * override rule (grant can only tighten, never loosen). */
  readonly maxMissionDurationMinutes?: number
  readonly enablePortabilityWebResearch?: boolean
  readonly webSearchProvider?: WebSearchProvider
  readonly env?: ProviderGatewayEnv
  readonly overrideStore?: ProviderRuntimeOverrideStore
}

/**
 * Assembles the live server autonomy runtime. Validation is discovered from the
 * mission repository unless the operator supplies an explicit command list.
 */
export function createServerAutonomyRuntime(
  options: ServerAutonomyRuntimeOptions,
): AutonomousMissionRuntime {
  const taskExecutor = new MissionBoundTaskExecutor(options)
  const resolveValidationCommands = async (missionId: string, repositoryRoot: string) => {
    if (options.validationCommands !== undefined) return options.validationCommands
    const mission = options.missionService.get(missionId)
    const profile = await discoverUniversalRepositoryPortability(repositoryRoot)
    const validationCommands = profile.validation.map(encodePortableValidationInvocation)
    options.missionService.appendEvent(
      missionId,
      'autonomy.portability.detected',
      `Repository portability profile detected: ${profile.ecosystems.join(', ')}.`,
      {
        ecosystems: profile.ecosystems,
        primaryEcosystem: profile.primaryEcosystem,
        mixed: profile.mixed,
        manifests: profile.manifests,
        confidence: profile.confidence,
        validationCommands,
        validation: profile.validation,
        evidence: profile.evidence,
      },
    )

    if (options.enablePortabilityWebResearch !== false && profile.researchQueries.length > 0) {
      const policy = createRuntimePolicyForMode(mission.agent.runtimeMode, {
        hasGitHubToken: options.hasGitHubToken,
      })
      const research = await researchRepositoryPortability({
        repositoryRoot,
        profile,
        runtimePolicy: policy,
        ...(options.webSearchProvider === undefined ? {} : { provider: options.webSearchProvider }),
      })
      options.missionService.appendEvent(
        missionId,
        'autonomy.portability.researched',
        `Portability research completed for ${research.queries.length} query or queries.`,
        {
          queries: research.queries,
          guidance: research.guidance,
          statuses: research.evidence.map((entry) => entry.status),
          providers: research.evidence.map((entry) => entry.provider),
        },
      )
    }
    return validationCommands
  }

  return createAutonomousMissionRuntime({
    workspaceRoot: options.workspaceRoot,
    missionService: options.missionService,
    taskExecutor,
    ...(options.validationCommands === undefined
      ? { resolveValidationCommands }
      : { validationCommands: options.validationCommands }),
    ...(options.maxMissionDurationMinutes === undefined
      ? {}
      : { maxDurationMinutes: options.maxMissionDurationMinutes }),
    ...(options.accessRuntime === undefined ? {} : { accessRuntime: options.accessRuntime }),
  })
}

/**
 * The effective repair-attempt cap is the smaller of the global option and the mission's owning
 * grant's `executionLimits.maxRepairAttempts`, when both apply — a grant can only tighten the
 * global default, never loosen it. Clamped to `PersistentMissionRepairController`'s accepted
 * [0, 10] range so an out-of-range value an operator set on a grant can't crash mission
 * preparation. Exported as a standalone pure function so it's testable without constructing the
 * full autonomy runtime.
 */
export function resolveMaxRepairAttempts(
  mission: SymbolWrightMission,
  options: Pick<ServerAutonomyRuntimeOptions, 'maxRepairAttempts' | 'accessRuntime'>,
): number | undefined {
  const globalCap = options.maxRepairAttempts
  const grant =
    mission.grantId === undefined || options.accessRuntime === undefined
      ? undefined
      : options.accessRuntime.grantService.getGrant(mission.grantId)
  const grantCap = grant?.executionLimits.maxRepairAttempts

  const effective =
    grantCap === undefined
      ? globalCap
      : globalCap === undefined
        ? grantCap
        : Math.min(globalCap, grantCap)
  return effective === undefined ? undefined : Math.min(10, Math.max(0, Math.trunc(effective)))
}

class MissionBoundTaskExecutor implements MissionTaskExecutor {
  readonly #options: ServerAutonomyRuntimeOptions
  readonly #env: ProviderGatewayEnv
  readonly #overrideStore: ProviderRuntimeOverrideStore
  readonly #repairStore: JsonAutonomousRepairLoopStore
  #delegate: RuntimeMissionTaskExecutor | undefined

  constructor(options: ServerAutonomyRuntimeOptions) {
    this.#options = options
    this.#env = options.env ?? process.env
    this.#overrideStore = options.overrideStore ?? new ProviderRuntimeOverrideStore()
    this.#repairStore = new JsonAutonomousRepairLoopStore(options.workspaceRoot)
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
      ...(this.#options.portableRunner === undefined
        ? {}
        : { portableRunner: this.#options.portableRunner }),
    })
    const validationCommands = validationCommandsFromGraph(graph)
    const editExecutor =
      this.#options.editExecutor ??
      createMissionAutonomyEditExecutor({
        mission,
        env: this.#env,
        overrideStore: this.#overrideStore,
        workspaceRoot: this.#options.workspaceRoot,
        validationCommands,
      })
    const maxRepairAttempts = this.#resolveMaxRepairAttempts(mission)
    const repairController =
      editExecutor === undefined
        ? undefined
        : new PersistentMissionRepairController({
            store: this.#repairStore,
            editExecutor,
            projectMemory: new ProjectMemory(resolveProjectMemoryDir(mission.repository.rootPath)),
            missionId: mission.id,
            objective: mission.objective,
            repositoryRoot: mission.repository.rootPath,
            validationCommands,
            ...(maxRepairAttempts === undefined ? {} : { maxRepairAttempts }),
            recordEvent: (type, summary, payload) => {
              this.#options.missionService.appendEvent(mission.id, type, summary, payload)
            },
          })

    this.#delegate = new RuntimeMissionTaskExecutor({
      repositoryRoot: mission.repository.rootPath,
      validationRunner,
      ...(editExecutor === undefined ? {} : { editExecutor }),
      ...(repairController === undefined ? {} : { repairController }),
    })
  }

  async execute(task: AutonomousTaskNode): Promise<MissionTaskExecutionResult> {
    return this.#preparedDelegate().execute(task)
  }

  async repair(input: MissionTaskRepairInput): Promise<MissionTaskExecutionResult> {
    return this.#preparedDelegate().repair(input)
  }

  #preparedDelegate(): RuntimeMissionTaskExecutor {
    if (this.#delegate === undefined) {
      throw new Error('Autonomous task executor was not prepared for a mission.')
    }
    return this.#delegate
  }

  #resolveMaxRepairAttempts(mission: SymbolWrightMission): number | undefined {
    return resolveMaxRepairAttempts(mission, this.#options)
  }
}

function validationCommandsFromGraph(graph: AutonomousTaskGraph): readonly string[] {
  return graph.tasks
    .filter((task) => task.kind === 'validation')
    .map((task) => (task.objective.startsWith('Run ') ? task.objective.slice(4) : task.objective))
}
