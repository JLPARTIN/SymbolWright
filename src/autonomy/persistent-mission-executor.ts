import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  abortReasonOf,
  type MissionExecutionAbortReason,
} from './mission-execution-abort-registry.js'
import { MissionExecutionLock } from './mission-execution-lock.js'
import type {
  AutonomousTaskGraph,
  AutonomousTaskNode,
  AutonomousTaskState,
} from './task-graph.types.js'

export interface MissionTaskExecutionResult {
  readonly state: Extract<AutonomousTaskState, 'completed' | 'failed' | 'blocked'>
  readonly evidence?: AutonomousTaskNode['evidence']
  readonly artifacts?: readonly string[]
  readonly modifiedFiles?: readonly string[]
  readonly diagnostics?: readonly string[]
}

export interface MissionTaskRepairInput {
  readonly execution: PersistedMissionExecution
  readonly validationTask: AutonomousTaskNode
  readonly failure: MissionTaskExecutionResult
}

export interface MissionTaskExecutor {
  prepare?(graph: AutonomousTaskGraph): Promise<void> | void
  /** `signal`, when provided, is the same abort signal `run()` observes -- forwarded so an
   * individual task implementation (e.g. the agent-loop-backed executor) can stop its own
   * in-flight work promptly instead of only being interrupted between tasks. Optional so any
   * other `MissionTaskExecutor` implementation that ignores it still compiles and works exactly
   * as before. */
  execute(task: AutonomousTaskNode, signal?: AbortSignal): Promise<MissionTaskExecutionResult>
  repair?(input: MissionTaskRepairInput): Promise<MissionTaskExecutionResult>
}

export interface PersistedMissionExecution {
  readonly schemaVersion: 1
  readonly graph: AutonomousTaskGraph
  readonly modifiedFiles: readonly string[]
  readonly startedAt: string
  readonly updatedAt: string
  readonly completedAt?: string | undefined
  /** Monotonically increasing on every save -- an observability/audit counter, not itself the
   * concurrency-safety mechanism (that's `MissionExecutionLock`, which serializes every
   * read-modify-write sequence against this record across both this executor and
   * `AutonomousMissionControl`). Optional so pre-existing persisted records without it still
   * parse; treated as `0` when absent. */
  readonly revision?: number
  /** Set when the execution stopped early via `run()` observing an abort signal, distinguishing
   * an operator-requested stop from a shutdown/budget/duration-triggered one for the mission
   * timeline and audit trail. */
  readonly cancellationReason?: MissionExecutionAbortReason
}

export class MissionAlreadyRunningError extends Error {}

export interface MissionExecutionStore {
  load(missionId: string): Promise<PersistedMissionExecution | undefined>
  save(execution: PersistedMissionExecution): Promise<void>
}

export class JsonMissionExecutionStore implements MissionExecutionStore {
  readonly #root: string

  constructor(workspaceRoot: string) {
    this.#root = path.resolve(workspaceRoot, '.symbolwright', 'autonomy', 'missions')
  }

  async load(missionId: string): Promise<PersistedMissionExecution | undefined> {
    try {
      const raw = await readFile(path.join(this.#root, `${validateId(missionId)}.json`), 'utf8')
      return JSON.parse(raw) as PersistedMissionExecution
    } catch (error) {
      if (isMissing(error)) return undefined
      throw error
    }
  }

  async save(execution: PersistedMissionExecution): Promise<void> {
    await mkdir(this.#root, { recursive: true })
    const destination = path.join(this.#root, `${validateId(execution.graph.missionId)}.json`)
    const temporary = `${destination}.${randomUUID()}.tmp`
    const withRevision: PersistedMissionExecution = {
      ...execution,
      revision: (execution.revision ?? 0) + 1,
    }
    await writeFile(temporary, `${JSON.stringify(withRevision, null, 2)}\n`, { mode: 0o600 })
    await rename(temporary, destination)
  }
}

export interface MissionExecutionRunOptions {
  /** When set, `run()` stops launching further tasks once this many minutes have elapsed since
   * `execution.startedAt`, failing every remaining non-terminal task with a clear diagnostic
   * instead of continuing indefinitely. Checked between tasks, not by pre-empting one already in
   * flight — the executor has no way to interrupt an arbitrary in-progress tool/sandbox call. */
  readonly maxDurationMinutes?: number
  /** Observed at the top of every loop iteration and forwarded into `MissionTaskExecutor.execute`.
   * Aborting stops the *next* iteration/task from starting; an already in-flight task still runs
   * to its own natural completion (bounded by its own timeout), but its result is discarded
   * rather than applied if the persisted state changed underneath it while it ran (see
   * `#reconcileAfterTask`) -- concurrent cancellation always wins over a task's own completion. */
  readonly signal?: AbortSignal
}

export class PersistentMissionExecutor {
  readonly #store: MissionExecutionStore
  readonly #executor: MissionTaskExecutor
  readonly #now: () => Date
  readonly #lock: MissionExecutionLock

  constructor(input: {
    readonly store: MissionExecutionStore
    readonly executor: MissionTaskExecutor
    readonly now?: () => Date
    /** Shared with `AutonomousMissionControl` so pause/cancel/retry's own read-modify-write
     * serializes against this executor's -- see `mission-execution-lock.ts`. Defaults to a
     * private instance (correct for standalone/test usage where nothing else touches the same
     * persisted records concurrently). */
    readonly lock?: MissionExecutionLock
  }) {
    this.#store = input.store
    this.#executor = input.executor
    this.#now = input.now ?? (() => new Date())
    this.#lock = input.lock ?? new MissionExecutionLock()
  }

  async start(
    graph: AutonomousTaskGraph,
    options: MissionExecutionRunOptions = {},
  ): Promise<PersistedMissionExecution> {
    await this.#executor.prepare?.(graph)
    const now = this.#now().toISOString()
    const execution: PersistedMissionExecution = {
      schemaVersion: 1,
      graph: reconcileGraph(graph),
      modifiedFiles: [],
      startedAt: now,
      updatedAt: now,
    }
    await this.#store.save(execution)
    return this.run(execution, options)
  }

  async resume(
    missionId: string,
    options: MissionExecutionRunOptions = {},
  ): Promise<PersistedMissionExecution> {
    const persisted = await this.#store.load(missionId)
    if (!persisted) throw new Error(`Mission execution ${missionId} was not found.`)
    if (persisted.completedAt !== undefined) return persisted
    await this.#executor.prepare?.(persisted.graph)
    const resumed = { ...persisted, graph: reconcileGraph(persisted.graph) }
    await this.#store.save(resumed)
    return this.run(resumed, options)
  }

  async run(
    initial: PersistedMissionExecution,
    options: MissionExecutionRunOptions = {},
  ): Promise<PersistedMissionExecution> {
    const missionId = initial.graph.missionId
    let current = initial
    while (true) {
      if (options.signal?.aborted === true) {
        current = await this.#stopForAbort(missionId, current, options.signal)
        return current
      }

      if (
        options.maxDurationMinutes !== undefined &&
        this.#exceedsDuration(current, options.maxDurationMinutes)
      ) {
        current = await this.#lock.withLock(missionId, async () => {
          const latest = (await this.#store.load(missionId)) ?? current
          const stopped = {
            ...this.#failRemainingTasksForDurationLimit(latest, options.maxDurationMinutes!),
            cancellationReason: 'duration' as const,
          }
          await this.#store.save(stopped)
          return stopped
        })
        return current
      }

      const next = findNextTask(current.graph)
      if (next === undefined) {
        const unfinished = current.graph.tasks.some((task) => !isTerminal(task.state))
        if (unfinished) return current
        const completedAt = this.#now().toISOString()
        current = {
          ...current,
          updatedAt: completedAt,
          completedAt,
        }
        await this.#store.save(current)
        return current
      }

      current = await this.#executeTask(current, next, options.signal)
    }
  }

  /** Runs before the next task starts, when `options.signal` is already aborted. If a concurrent
   * `AutonomousMissionControl` mutation already resolved the abort (e.g. `cancel()` already
   * marked every pending/active task `cancelled` before calling `requestAbort`), this is a
   * no-op merge -- the freshest persisted state is simply returned. If nothing has resolved it
   * yet (e.g. a bare graceful-shutdown abort with no corresponding HTTP mutation), every
   * non-terminal task is marked `interrupted` (resumable) rather than left stuck "running"
   * forever. */
  async #stopForAbort(
    missionId: string,
    fallback: PersistedMissionExecution,
    signal: AbortSignal,
  ): Promise<PersistedMissionExecution> {
    return this.#lock.withLock(missionId, async () => {
      const latest = (await this.#store.load(missionId)) ?? fallback
      if (latest.completedAt !== undefined) return latest
      const unfinished = latest.graph.tasks.some((task) => !isTerminal(task.state))
      if (!unfinished) return latest
      const updatedAt = this.#now().toISOString()
      const tasks = latest.graph.tasks.map((task) =>
        isTerminal(task.state) ? task : { ...task, state: 'interrupted' as const, updatedAt },
      )
      const stopped: PersistedMissionExecution = {
        ...latest,
        graph: { ...latest.graph, tasks, updatedAt },
        updatedAt,
        cancellationReason: abortReasonOf(signal) ?? 'system',
      }
      await this.#store.save(stopped)
      return stopped
    })
  }

  #exceedsDuration(execution: PersistedMissionExecution, maxDurationMinutes: number): boolean {
    const elapsedMs = this.#now().getTime() - new Date(execution.startedAt).getTime()
    return elapsedMs > maxDurationMinutes * 60_000
  }

  #failRemainingTasksForDurationLimit(
    execution: PersistedMissionExecution,
    maxDurationMinutes: number,
  ): PersistedMissionExecution {
    const updatedAt = this.#now().toISOString()
    const reason = `Mission exceeded its configured duration limit of ${maxDurationMinutes} minute(s).`
    const tasks = execution.graph.tasks.map((task) =>
      isTerminal(task.state)
        ? task
        : {
            ...task,
            state: 'failed' as const,
            failureDiagnostics: [...task.failureDiagnostics, reason],
            updatedAt,
          },
    )
    return {
      ...execution,
      graph: { ...execution.graph, tasks, updatedAt },
      updatedAt,
      completedAt: updatedAt,
    }
  }

  async #executeTask(
    execution: PersistedMissionExecution,
    task: AutonomousTaskNode,
    signal?: AbortSignal,
  ): Promise<PersistedMissionExecution> {
    const missionId = execution.graph.missionId
    const startedAt = new Date().toISOString()
    const activeState =
      task.kind === 'validation' ? 'validating' : task.kind === 'repair' ? 'repairing' : 'running'

    // Reload-under-lock before marking the task active, not just before the final write below --
    // a concurrent `AutonomousMissionControl` mutation may have edited a *different* task in this
    // same graph since `execution` was captured (e.g. cancelling one task while this one starts),
    // and writing from a stale full-graph snapshot would silently clobber that edit.
    const current = await this.#lock.withLock(missionId, async () => {
      const latest = (await this.#store.load(missionId)) ?? execution
      const updated = updateTask(latest, task.id, {
        state: activeState,
        startedAt,
        updatedAt: startedAt,
      })
      await this.#store.save(updated)
      return updated
    })

    try {
      const result = await this.#executor.execute(findTask(current.graph, task.id), signal)
      if (
        task.kind === 'validation' &&
        result.state === 'failed' &&
        this.#executor.repair !== undefined
      ) {
        return this.#repairValidationFailure(current, task.id, result)
      }
      return await this.#reconcileAfterTask(missionId, task.id, activeState, (latest) =>
        applyTaskResult(latest, task.id, result),
      )
    } catch (error) {
      const failedAt = new Date().toISOString()
      return await this.#reconcileAfterTask(missionId, task.id, activeState, (latest) => {
        const existing = findTask(latest.graph, task.id)
        const attempts = existing.retry.attempts + 1
        const state = attempts < existing.retry.maxAttempts ? 'ready' : 'failed'
        return updateTask(latest, task.id, {
          state,
          retry: { ...existing.retry, attempts },
          failureDiagnostics: [...existing.failureDiagnostics, errorMessage(error)],
          updatedAt: failedAt,
        })
      })
    }
  }

  /** Runs after a task's real work settles (success or failure), reloading the latest persisted
   * state under the lock immediately before deciding what to write. If the task is no longer in
   * the active state this executor itself set it to before starting -- i.e. a concurrent
   * `AutonomousMissionControl` mutation (cancel/pause) already moved it off that state while the
   * work was in flight -- that mutation wins: this task's own result is discarded entirely rather
   * than overwriting it. Otherwise `applyResult` is applied to the *freshest* state (not the
   * possibly-stale `current` the task started from) and saved. This is the concrete fix for the
   * cancel-during-task race: a bare pre-write comparison without a lock still has a gap between
   * the comparison and the write for another writer to slip into; reloading and deciding *inside*
   * the same lock both `PersistentMissionExecutor` and `AutonomousMissionControl` share closes it. */
  async #reconcileAfterTask(
    missionId: string,
    taskId: string,
    expectedActiveState: AutonomousTaskState,
    applyResult: (latest: PersistedMissionExecution) => PersistedMissionExecution,
  ): Promise<PersistedMissionExecution> {
    return this.#lock.withLock(missionId, async () => {
      const latest = await this.#store.load(missionId)
      if (latest === undefined) {
        throw new Error(
          `Mission execution ${missionId} disappeared while executing task ${taskId}.`,
        )
      }
      if (findTask(latest.graph, taskId).state !== expectedActiveState) {
        return latest
      }
      const applied = applyResult(latest)
      await this.#store.save(applied)
      return applied
    })
  }

  async #repairValidationFailure(
    execution: PersistedMissionExecution,
    taskId: string,
    failure: MissionTaskExecutionResult,
  ): Promise<PersistedMissionExecution> {
    const failedAt = new Date().toISOString()
    const existing = findTask(execution.graph, taskId)
    let current = updateTask(execution, taskId, {
      state: 'repairing',
      retry: { ...existing.retry, attempts: existing.retry.attempts + 1 },
      evidence: [...existing.evidence, ...(failure.evidence ?? [])],
      artifacts: [...new Set([...existing.artifacts, ...(failure.artifacts ?? [])])],
      failureDiagnostics: [...existing.failureDiagnostics, ...(failure.diagnostics ?? [])],
      updatedAt: failedAt,
    })
    current = mergeModifiedFiles(current, failure.modifiedFiles)
    await this.#store.save(current)

    let repair: MissionTaskExecutionResult
    try {
      repair = await this.#executor.repair!({
        execution: current,
        validationTask: findTask(current.graph, taskId),
        failure,
      })
    } catch (error) {
      repair = {
        state: 'failed',
        diagnostics: [errorMessage(error)],
        evidence: [{ kind: 'diagnostic', id: `repair-exception-${taskId}` }],
      }
    }

    current = mergeModifiedFiles(current, repair.modifiedFiles)
    if (repair.state === 'completed') {
      current = resetValidationChain(current, taskId, repair)
      await this.#store.save(current)
      return current
    }

    const completedAt = new Date().toISOString()
    const repairingTask = findTask(current.graph, taskId)
    current = updateTask(current, taskId, {
      state: repair.state,
      evidence: [...repairingTask.evidence, ...(repair.evidence ?? [])],
      artifacts: [...new Set([...repairingTask.artifacts, ...(repair.artifacts ?? [])])],
      failureDiagnostics: [...repairingTask.failureDiagnostics, ...(repair.diagnostics ?? [])],
      updatedAt: completedAt,
    })
    await this.#store.save(current)
    return current
  }
}

function applyTaskResult(
  execution: PersistedMissionExecution,
  taskId: string,
  result: MissionTaskExecutionResult,
): PersistedMissionExecution {
  const completedAt = new Date().toISOString()
  const existing = findTask(execution.graph, taskId)
  let current = updateTask(execution, taskId, {
    state: result.state,
    retry: {
      ...existing.retry,
      attempts: existing.retry.attempts + 1,
    },
    evidence: [...existing.evidence, ...(result.evidence ?? [])],
    artifacts: [...new Set([...existing.artifacts, ...(result.artifacts ?? [])])],
    failureDiagnostics: [...existing.failureDiagnostics, ...(result.diagnostics ?? [])],
    updatedAt: completedAt,
    ...(result.state === 'completed' ? { completedAt } : {}),
  })
  current = mergeModifiedFiles(current, result.modifiedFiles)
  return current
}

function resetValidationChain(
  execution: PersistedMissionExecution,
  repairedTaskId: string,
  repair: MissionTaskExecutionResult,
): PersistedMissionExecution {
  const updatedAt = new Date().toISOString()
  const completedNonValidation = new Set(
    execution.graph.tasks
      .filter((task) => task.kind !== 'validation' && task.state === 'completed')
      .map((task) => task.id),
  )
  const tasks = execution.graph.tasks.map((task) => {
    if (task.kind !== 'validation') return task
    const { startedAt: _startedAt, completedAt: _completedAt, ...base } = task
    const repaired = task.id === repairedTaskId
    return {
      ...base,
      state: task.dependencies.every((dependency) => completedNonValidation.has(dependency))
        ? ('ready' as const)
        : ('queued' as const),
      evidence: repaired ? [...task.evidence, ...(repair.evidence ?? [])] : task.evidence,
      artifacts: repaired
        ? [...new Set([...task.artifacts, ...(repair.artifacts ?? [])])]
        : task.artifacts,
      failureDiagnostics: repaired
        ? [...task.failureDiagnostics, ...(repair.diagnostics ?? [])]
        : task.failureDiagnostics,
      updatedAt,
    }
  })
  return {
    ...execution,
    graph: { ...execution.graph, tasks, updatedAt },
    updatedAt,
  }
}

function mergeModifiedFiles(
  execution: PersistedMissionExecution,
  modifiedFiles: readonly string[] | undefined,
): PersistedMissionExecution {
  if (modifiedFiles === undefined || modifiedFiles.length === 0) return execution
  return {
    ...execution,
    modifiedFiles: [...new Set([...execution.modifiedFiles, ...modifiedFiles])].sort(),
  }
}

function reconcileGraph(graph: AutonomousTaskGraph): AutonomousTaskGraph {
  const updatedAt = new Date().toISOString()
  return {
    ...graph,
    updatedAt,
    tasks: graph.tasks.map((task) =>
      task.state === 'running' || task.state === 'validating' || task.state === 'repairing'
        ? { ...task, state: 'interrupted' as const, updatedAt }
        : task,
    ),
  }
}

function findNextTask(graph: AutonomousTaskGraph): AutonomousTaskNode | undefined {
  const completed = new Set(
    graph.tasks.filter((task) => task.state === 'completed').map((task) => task.id),
  )
  return graph.tasks.find((task) => {
    if (!['queued', 'ready', 'interrupted'].includes(task.state)) return false
    return task.dependencies.every((dependency) => completed.has(dependency))
  })
}

function updateTask(
  execution: PersistedMissionExecution,
  taskId: string,
  patch: Partial<AutonomousTaskNode>,
): PersistedMissionExecution {
  const graph = {
    ...execution.graph,
    updatedAt: new Date().toISOString(),
    tasks: graphTasks(execution.graph.tasks, taskId, patch),
  }
  return { ...execution, graph, updatedAt: graph.updatedAt }
}

function graphTasks(
  tasks: readonly AutonomousTaskNode[],
  taskId: string,
  patch: Partial<AutonomousTaskNode>,
): readonly AutonomousTaskNode[] {
  return tasks.map((task) =>
    task.id === taskId ? ({ ...task, ...patch } as AutonomousTaskNode) : task,
  )
}

function findTask(graph: AutonomousTaskGraph, taskId: string): AutonomousTaskNode {
  const task = graph.tasks.find((candidate) => candidate.id === taskId)
  if (!task) throw new Error(`Task ${taskId} was not found in mission graph.`)
  return task
}

function isTerminal(state: AutonomousTaskState): boolean {
  return ['completed', 'failed', 'cancelled', 'blocked'].includes(state)
}

function validateId(value: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) throw new Error(`Invalid mission ID: ${value}`)
  return value
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
