import type { MissionService } from '../mission/mission-service.js'
import type {
  MissionExecutionStore,
  PersistedMissionExecution,
} from './persistent-mission-executor.js'
import type { AutonomousTaskNode, AutonomousTaskState } from './task-graph.types.js'

export type AutonomousMissionControlAction = 'pause' | 'cancel' | 'retry'

export interface AutonomousMissionControlOptions {
  readonly executionStore: MissionExecutionStore
  readonly missionService: MissionService
  readonly now?: () => Date
}

export class AutonomousMissionControl {
  readonly #executionStore: MissionExecutionStore
  readonly #missionService: MissionService
  readonly #now: () => Date

  constructor(options: AutonomousMissionControlOptions) {
    this.#executionStore = options.executionStore
    this.#missionService = options.missionService
    this.#now = options.now ?? (() => new Date())
  }

  async pause(missionId: string): Promise<PersistedMissionExecution> {
    return this.#mutate(missionId, 'pause', (task) => {
      if (isActive(task.state)) return { ...task, state: 'interrupted' as const }
      return task
    })
  }

  async cancel(missionId: string): Promise<PersistedMissionExecution> {
    return this.#mutate(missionId, 'cancel', (task) => {
      if (isPending(task.state) || isActive(task.state)) {
        return { ...task, state: 'cancelled' as const }
      }
      return task
    })
  }

  async retry(missionId: string): Promise<PersistedMissionExecution> {
    return this.#mutate(missionId, 'retry', (task) => {
      if (task.state !== 'failed' && task.state !== 'blocked' && task.state !== 'cancelled') {
        return task
      }
      return {
        ...task,
        state: task.dependencies.length === 0 ? ('ready' as const) : ('queued' as const),
        failureDiagnostics: [],
        completedAt: undefined,
      }
    })
  }

  async #mutate(
    missionId: string,
    action: AutonomousMissionControlAction,
    updateTask: (task: AutonomousTaskNode) => AutonomousTaskNode,
  ): Promise<PersistedMissionExecution> {
    this.#missionService.get(missionId)
    const execution = await this.#executionStore.load(missionId)
    if (execution === undefined) {
      throw new Error(`Autonomous execution was not found: ${missionId}`)
    }

    const updatedAt = this.#now().toISOString()
    const tasks = execution.graph.tasks.map((task) => {
      const updated = updateTask(task)
      return updated === task ? task : { ...updated, updatedAt }
    })
    const changed = tasks.some((task, index) => task !== execution.graph.tasks[index])
    if (!changed) {
      throw new Error(`Autonomous mission ${missionId} cannot ${action} from its current state.`)
    }

    const updated: PersistedMissionExecution = {
      ...execution,
      graph: { ...execution.graph, tasks, updatedAt },
      updatedAt,
      ...(action === 'retry' ? { completedAt: undefined } : {}),
    }
    await this.#executionStore.save(updated)
    this.#missionService.appendEvent(
      missionId,
      `autonomy.control.${action}`,
      `Autonomous mission ${action} requested by the operator.`,
      {
        taskStates: summarizeTaskStates(tasks),
        modifiedFiles: updated.modifiedFiles,
      },
    )
    return updated
  }
}

function isActive(state: AutonomousTaskState): boolean {
  return state === 'running' || state === 'validating' || state === 'repairing'
}

function isPending(state: AutonomousTaskState): boolean {
  return state === 'queued' || state === 'ready' || state === 'interrupted'
}

function summarizeTaskStates(tasks: readonly AutonomousTaskNode[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const task of tasks) counts[task.state] = (counts[task.state] ?? 0) + 1
  return counts
}
