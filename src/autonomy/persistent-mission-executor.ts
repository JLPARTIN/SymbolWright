import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

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
  execute(task: AutonomousTaskNode): Promise<MissionTaskExecutionResult>
  repair?(input: MissionTaskRepairInput): Promise<MissionTaskExecutionResult>
}

export interface PersistedMissionExecution {
  readonly schemaVersion: 1
  readonly graph: AutonomousTaskGraph
  readonly modifiedFiles: readonly string[]
  readonly startedAt: string
  readonly updatedAt: string
  readonly completedAt?: string | undefined
}

export interface MissionExecutionStore {
  load(missionId: string): Promise<PersistedMissionExecution | undefined>
  save(execution: PersistedMissionExecution): Promise<void>
}

export class JsonMissionExecutionStore implements MissionExecutionStore {
  readonly #root: string

  constructor(workspaceRoot: string) {
    this.#root = path.resolve(workspaceRoot, '.codemind', 'autonomy', 'missions')
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
    await writeFile(temporary, `${JSON.stringify(execution, null, 2)}\n`, { mode: 0o600 })
    await rename(temporary, destination)
  }
}

export class PersistentMissionExecutor {
  readonly #store: MissionExecutionStore
  readonly #executor: MissionTaskExecutor

  constructor(input: {
    readonly store: MissionExecutionStore
    readonly executor: MissionTaskExecutor
  }) {
    this.#store = input.store
    this.#executor = input.executor
  }

  async start(graph: AutonomousTaskGraph): Promise<PersistedMissionExecution> {
    await this.#executor.prepare?.(graph)
    const now = new Date().toISOString()
    const execution: PersistedMissionExecution = {
      schemaVersion: 1,
      graph: reconcileGraph(graph),
      modifiedFiles: [],
      startedAt: now,
      updatedAt: now,
    }
    await this.#store.save(execution)
    return this.run(execution)
  }

  async resume(missionId: string): Promise<PersistedMissionExecution> {
    const persisted = await this.#store.load(missionId)
    if (!persisted) throw new Error(`Mission execution ${missionId} was not found.`)
    if (persisted.completedAt !== undefined) return persisted
    await this.#executor.prepare?.(persisted.graph)
    const resumed = { ...persisted, graph: reconcileGraph(persisted.graph) }
    await this.#store.save(resumed)
    return this.run(resumed)
  }

  async run(initial: PersistedMissionExecution): Promise<PersistedMissionExecution> {
    let current = initial
    while (true) {
      const next = findNextTask(current.graph)
      if (next === undefined) {
        const unfinished = current.graph.tasks.some((task) => !isTerminal(task.state))
        if (unfinished) return current
        const completedAt = new Date().toISOString()
        current = {
          ...current,
          updatedAt: completedAt,
          completedAt,
        }
        await this.#store.save(current)
        return current
      }

      current = await this.#executeTask(current, next)
    }
  }

  async #executeTask(
    execution: PersistedMissionExecution,
    task: AutonomousTaskNode,
  ): Promise<PersistedMissionExecution> {
    const startedAt = new Date().toISOString()
    let current = updateTask(execution, task.id, {
      state:
        task.kind === 'validation'
          ? 'validating'
          : task.kind === 'repair'
            ? 'repairing'
            : 'running',
      startedAt,
      updatedAt: startedAt,
    })
    await this.#store.save(current)

    try {
      const result = await this.#executor.execute(findTask(current.graph, task.id))
      if (
        task.kind === 'validation' &&
        result.state === 'failed' &&
        this.#executor.repair !== undefined
      ) {
        return this.#repairValidationFailure(current, task.id, result)
      }
      current = applyTaskResult(current, task.id, result)
      await this.#store.save(current)
      return current
    } catch (error) {
      const failedAt = new Date().toISOString()
      const existing = findTask(current.graph, task.id)
      const attempts = existing.retry.attempts + 1
      const state = attempts < existing.retry.maxAttempts ? 'ready' : 'failed'
      current = updateTask(current, task.id, {
        state,
        retry: { ...existing.retry, attempts },
        failureDiagnostics: [...existing.failureDiagnostics, errorMessage(error)],
        updatedAt: failedAt,
      })
      await this.#store.save(current)
      return current
    }
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
