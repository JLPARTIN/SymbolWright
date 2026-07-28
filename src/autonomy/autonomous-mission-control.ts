import type { MissionService } from '../mission/mission-service.js'
import type { MissionExecutionAbortRegistry } from './mission-execution-abort-registry.js'
import { MissionExecutionLock } from './mission-execution-lock.js'
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
  /** Same instance passed to `PersistentMissionExecutor` -- serializes this class's
   * read-modify-write against a concurrently-running `run()` loop's. Defaults to a private
   * instance (fine for standalone/test usage; production wiring always shares one via
   * `autonomous-mission-runtime.ts`). */
  readonly lock?: MissionExecutionLock
  /** Lets `pause`/`cancel` reach an in-flight `run()` loop for the same mission -- without this,
   * these methods only ever mutate persisted JSON, which a currently-executing loop (holding its
   * own in-memory copy) has no way to observe until it finishes its current task on its own. */
  readonly abortRegistry?: MissionExecutionAbortRegistry
}

export class AutonomousMissionControl {
  readonly #executionStore: MissionExecutionStore
  readonly #missionService: MissionService
  readonly #now: () => Date
  readonly #lock: MissionExecutionLock
  readonly #abortRegistry: MissionExecutionAbortRegistry | undefined

  constructor(options: AutonomousMissionControlOptions) {
    this.#executionStore = options.executionStore
    this.#missionService = options.missionService
    this.#now = options.now ?? (() => new Date())
    this.#lock = options.lock ?? new MissionExecutionLock()
    this.#abortRegistry = options.abortRegistry
  }

  async pause(missionId: string): Promise<PersistedMissionExecution> {
    const result = await this.#mutate(missionId, 'pause', (task) => {
      if (isActive(task.state)) return { ...task, state: 'interrupted' as const }
      return task
    })
    this.#abortRegistry?.requestAbort(missionId, 'operator')
    return result
  }

  async cancel(missionId: string): Promise<PersistedMissionExecution> {
    const result = await this.#mutate(missionId, 'cancel', (task) => {
      if (isPending(task.state) || isActive(task.state)) {
        return { ...task, state: 'cancelled' as const }
      }
      return task
    })
    this.#abortRegistry?.requestAbort(missionId, 'operator')
    return result
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
    // The full read-modify-write runs inside the lock shared with `PersistentMissionExecutor`,
    // so this can never read state that a concurrently-running `run()` loop is about to
    // overwrite with a stale copy of its own -- see mission-execution-lock.ts.
    const updated = await this.#lock.withLock(missionId, async () => {
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

      const result: PersistedMissionExecution = {
        ...execution,
        graph: { ...execution.graph, tasks, updatedAt },
        updatedAt,
        ...(action === 'retry' ? { completedAt: undefined } : {}),
      }
      await this.#executionStore.save(result)
      return result
    })
    this.#missionService.appendEvent(
      missionId,
      `autonomy.control.${action}`,
      `Autonomous mission ${action} requested by the operator.`,
      {
        taskStates: summarizeTaskStates(updated.graph.tasks),
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
