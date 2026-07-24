import type { MissionService } from '../mission/mission-service.js'
import type { AutonomousRepairLoopRecord } from './autonomous-repair-loop.js'
import {
  planAutonomousRepositoryMission,
  type AutonomousRepositoryPlan,
} from './autonomous-repository-planner.js'
import {
  projectMissionDashboard,
  type MissionDashboardProjection,
} from './mission-dashboard-projection.js'
import { createMissionImpactIntelligence } from './mission-impact-intelligence.js'
import {
  projectMultiAgentDashboard,
  type MultiAgentDashboardProjection,
} from './multi-agent-dashboard-projection.js'
import type { MultiAgentExecutionTracker } from './multi-agent-execution-tracker.js'
import type {
  MissionExecutionStore,
  PersistedMissionExecution,
  PersistentMissionExecutor,
} from './persistent-mission-executor.js'
import type { RepositorySemanticIndexSnapshot } from './repository-semantic-index.types.js'

export interface AutonomousMissionCoordinatorOptions {
  readonly missionService: MissionService
  readonly executor: PersistentMissionExecutor
  readonly executionStore: MissionExecutionStore
  readonly loadSemanticIndex: (repositoryRoot: string) => Promise<RepositorySemanticIndexSnapshot>
  readonly loadRepairLoop?: (missionId: string) => Promise<AutonomousRepairLoopRecord | undefined>
  readonly validationCommands?: readonly string[]
  readonly resolveValidationCommands?: (
    missionId: string,
    repositoryRoot: string,
  ) => Promise<readonly string[]>
  readonly multiAgentTracker?: MultiAgentExecutionTracker
  readonly now?: () => Date
}

export interface AutonomousMissionStartResult {
  readonly plan: AutonomousRepositoryPlan
  readonly execution: PersistedMissionExecution
  readonly dashboard: MissionDashboardProjection
}

export class AutonomousMissionCoordinator {
  readonly #missionService: MissionService
  readonly #executor: PersistentMissionExecutor
  readonly #executionStore: MissionExecutionStore
  readonly #loadSemanticIndex: AutonomousMissionCoordinatorOptions['loadSemanticIndex']
  readonly #loadRepairLoop: AutonomousMissionCoordinatorOptions['loadRepairLoop']
  readonly #validationCommands: readonly string[]
  readonly #resolveValidationCommands:
    | AutonomousMissionCoordinatorOptions['resolveValidationCommands']
    | undefined
  readonly #multiAgentTracker: MultiAgentExecutionTracker | undefined
  readonly #now: () => Date

  constructor(options: AutonomousMissionCoordinatorOptions) {
    this.#missionService = options.missionService
    this.#executor = options.executor
    this.#executionStore = options.executionStore
    this.#loadSemanticIndex = options.loadSemanticIndex
    this.#loadRepairLoop = options.loadRepairLoop
    this.#validationCommands = [...(options.validationCommands ?? [])]
    this.#resolveValidationCommands = options.resolveValidationCommands
    this.#multiAgentTracker = options.multiAgentTracker
    this.#now = options.now ?? (() => new Date())
  }

  async start(missionId: string): Promise<AutonomousMissionStartResult> {
    const mission = this.#missionService.get(missionId)
    const [index, validationCommands] = await Promise.all([
      this.#loadSemanticIndex(mission.repository.rootPath),
      this.#commands(missionId, mission.repository.rootPath),
    ])
    const plan = planAutonomousRepositoryMission({
      missionId,
      objective: mission.objective,
      repositoryRoot: mission.repository.rootPath,
      index,
      validationCommands,
      now: this.#now().toISOString(),
    })

    this.#missionService.appendEvent(
      missionId,
      'autonomy.plan.created',
      'Executable autonomous repository plan created.',
      {
        taskCount: plan.graph.tasks.length,
        affectedFiles: plan.affectedFiles,
        matchedSymbols: plan.matchedSymbols,
        validationCommands,
        rationale: plan.rationale,
      },
    )

    const execution = await this.#executor.start(plan.graph)
    await this.#synchronizeSpecialists(execution)
    this.#recordExecutionEvents(missionId, execution)
    return {
      plan,
      execution,
      dashboard: await this.#dashboard(execution, index),
    }
  }

  async resume(missionId: string): Promise<AutonomousMissionStartResult> {
    const mission = this.#missionService.get(missionId)
    const execution = await this.#executor.resume(missionId)
    await this.#synchronizeSpecialists(execution)
    this.#recordExecutionEvents(missionId, execution)
    const index = await this.#loadSemanticIndex(mission.repository.rootPath)
    const validationCommands = execution.graph.tasks
      .filter((task) => task.kind === 'validation')
      .map((task) => validationCommand(task.objective))
    const plan = planAutonomousRepositoryMission({
      missionId,
      objective: mission.objective,
      repositoryRoot: mission.repository.rootPath,
      index,
      validationCommands,
      now: execution.graph.createdAt,
    })
    return {
      plan,
      execution,
      dashboard: await this.#dashboard(execution, index),
    }
  }

  async status(missionId: string): Promise<MissionDashboardProjection> {
    const mission = this.#missionService.get(missionId)
    const execution = await this.#loadExecution(missionId)
    const index = await this.#loadSemanticIndex(mission.repository.rootPath)
    return this.#dashboard(execution, index)
  }

  async specialists(missionId: string): Promise<MultiAgentDashboardProjection | undefined> {
    this.#missionService.get(missionId)
    const execution = await this.#loadExecution(missionId)
    const state = await this.#synchronizeSpecialists(execution)
    return state === undefined ? undefined : projectMultiAgentDashboard(state)
  }

  async #dashboard(
    execution: PersistedMissionExecution,
    index: RepositorySemanticIndexSnapshot,
  ): Promise<MissionDashboardProjection> {
    const repairLoop = await this.#loadRepairLoop?.(execution.graph.missionId)
    return projectMissionDashboard({
      execution,
      ...(repairLoop === undefined ? {} : { repairLoop }),
      intelligence: createMissionImpactIntelligence({ execution, semanticIndex: index }),
      now: this.#now().toISOString(),
    })
  }

  async #commands(missionId: string, repositoryRoot: string): Promise<readonly string[]> {
    if (this.#validationCommands.length > 0) return this.#validationCommands
    const resolved = await this.#resolveValidationCommands?.(missionId, repositoryRoot)
    return resolved ?? []
  }

  async #loadExecution(missionId: string): Promise<PersistedMissionExecution> {
    const execution = await this.#executionStore.load(missionId)
    if (execution === undefined) {
      throw new Error(`Autonomous execution was not found: ${missionId}`)
    }
    return execution
  }

  async #synchronizeSpecialists(execution: PersistedMissionExecution) {
    return this.#multiAgentTracker?.synchronize(execution)
  }

  #recordExecutionEvents(missionId: string, execution: PersistedMissionExecution): void {
    const failedTasks = execution.graph.tasks
      .filter((task) => task.state === 'failed')
      .map((task) => task.id)
    const state = failedTasks.length > 0 ? 'failed' : execution.completedAt ? 'completed' : 'paused'
    this.#missionService.appendEvent(
      missionId,
      `autonomy.execution.${state}`,
      `Autonomous mission execution ${state}.`,
      {
        modifiedFiles: execution.modifiedFiles,
        completedTasks: execution.graph.tasks
          .filter((task) => task.state === 'completed')
          .map((task) => task.id),
        failedTasks,
      },
    )

    for (const task of execution.graph.tasks) {
      for (const evidence of task.evidence) {
        this.#missionService.appendEvent(
          missionId,
          'autonomy.task.evidence',
          `Evidence recorded for autonomous task ${task.id}.`,
          { taskId: task.id, evidence },
        )
      }
    }
  }
}

function validationCommand(objective: string): string {
  return objective.startsWith('Run ') ? objective.slice(4) : objective
}
