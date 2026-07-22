import type { MissionService } from '../mission/mission-service.js'
import { planAutonomousRepositoryMission, type AutonomousRepositoryPlan } from './autonomous-repository-planner.js'
import { projectMissionDashboard, type MissionDashboardProjection } from './mission-dashboard-projection.js'
import {
  PersistentMissionExecutor,
  type PersistentMissionExecutionRecord,
  type PersistentMissionTaskHandler,
} from './persistent-mission-executor.js'
import type { RepositorySemanticIndexSnapshot } from './repository-semantic-index.types.js'

export interface AutonomousMissionCoordinatorOptions {
  readonly missionService: MissionService
  readonly executor: PersistentMissionExecutor
  readonly loadSemanticIndex: (repositoryRoot: string) => Promise<RepositorySemanticIndexSnapshot>
  readonly validationCommands: readonly string[]
  readonly taskHandlers: ReadonlyMap<string, PersistentMissionTaskHandler>
  readonly now?: () => Date
}

export interface AutonomousMissionStartResult {
  readonly plan: AutonomousRepositoryPlan
  readonly execution: PersistentMissionExecutionRecord
  readonly dashboard: MissionDashboardProjection
}

export class AutonomousMissionCoordinator {
  readonly #missionService: MissionService
  readonly #executor: PersistentMissionExecutor
  readonly #loadSemanticIndex: AutonomousMissionCoordinatorOptions['loadSemanticIndex']
  readonly #validationCommands: readonly string[]
  readonly #taskHandlers: ReadonlyMap<string, PersistentMissionTaskHandler>
  readonly #now: () => Date

  constructor(options: AutonomousMissionCoordinatorOptions) {
    this.#missionService = options.missionService
    this.#executor = options.executor
    this.#loadSemanticIndex = options.loadSemanticIndex
    this.#validationCommands = [...options.validationCommands]
    this.#taskHandlers = options.taskHandlers
    this.#now = options.now ?? (() => new Date())
  }

  async start(missionId: string): Promise<AutonomousMissionStartResult> {
    const mission = this.#missionService.get(missionId)
    const index = await this.#loadSemanticIndex(mission.repository.rootPath)
    const plan = planAutonomousRepositoryMission({
      missionId,
      objective: mission.objective,
      repositoryRoot: mission.repository.rootPath,
      index,
      validationCommands: this.#validationCommands,
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
        rationale: plan.rationale,
      },
    )

    const created = await this.#executor.create(plan.graph)
    const execution = await this.#executor.run(created, this.#taskHandlers)
    this.#recordExecutionEvents(missionId, execution)

    return {
      plan,
      execution,
      dashboard: projectMissionDashboard(execution, this.#now()),
    }
  }

  async resume(missionId: string): Promise<AutonomousMissionStartResult> {
    const mission = this.#missionService.get(missionId)
    const execution = await this.#executor.resume(missionId, this.#taskHandlers)
    this.#recordExecutionEvents(missionId, execution)
    const index = await this.#loadSemanticIndex(mission.repository.rootPath)
    const plan = planAutonomousRepositoryMission({
      missionId,
      objective: mission.objective,
      repositoryRoot: mission.repository.rootPath,
      index,
      validationCommands: this.#validationCommands,
      now: execution.graph.createdAt,
    })
    return {
      plan,
      execution,
      dashboard: projectMissionDashboard(execution, this.#now()),
    }
  }

  async status(missionId: string): Promise<MissionDashboardProjection> {
    this.#missionService.get(missionId)
    const execution = await this.#executor.load(missionId)
    if (execution === undefined) throw new Error(`Autonomous execution was not found: ${missionId}`)
    return projectMissionDashboard(execution, this.#now())
  }

  #recordExecutionEvents(missionId: string, execution: PersistentMissionExecutionRecord): void {
    this.#missionService.appendEvent(
      missionId,
      `autonomy.execution.${execution.state}`,
      `Autonomous mission execution ${execution.state}.`,
      {
        modifiedFiles: execution.modifiedFiles,
        completedTasks: execution.graph.tasks.filter((task) => task.state === 'completed').map((task) => task.id),
        failedTasks: execution.graph.tasks.filter((task) => task.state === 'failed').map((task) => task.id),
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
