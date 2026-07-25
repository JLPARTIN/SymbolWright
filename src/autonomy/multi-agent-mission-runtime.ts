import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { MissionTaskExecutionResult } from './persistent-mission-executor.js'
import type { AutonomousTaskNode } from './task-graph.types.js'

export const SPECIALIST_AGENT_ROLES = [
  'planner',
  'repository-analyst',
  'code-editor',
  'test-runner',
  'repair-agent',
  'documentation-agent',
  'pr-summary-agent',
] as const

export type SpecialistAgentRole = (typeof SPECIALIST_AGENT_ROLES)[number]
export type SpecialistAgentStatus = 'idle' | 'running' | 'waiting' | 'failed' | 'completed'

export interface SpecialistAgentAssignment {
  readonly agentId: string
  readonly role: SpecialistAgentRole
  readonly taskId: string
  readonly status: SpecialistAgentStatus
  readonly startedAt?: string
  readonly completedAt?: string
  readonly evidence: readonly { readonly kind: string; readonly id: string }[]
  readonly diagnostics: readonly string[]
  readonly modifiedFiles: readonly string[]
}

export interface MultiAgentMissionState {
  readonly schemaVersion: 1
  readonly missionId: string
  readonly objective: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly assignments: readonly SpecialistAgentAssignment[]
}

export interface SpecialistAgentExecutor {
  execute(input: {
    readonly role: SpecialistAgentRole
    readonly task: AutonomousTaskNode
    readonly sharedContext: MultiAgentSharedContext
  }): Promise<MissionTaskExecutionResult>
}

export interface MultiAgentSharedContext {
  readonly missionId: string
  readonly objective: string
  readonly completedTaskIds: readonly string[]
  readonly evidence: readonly { readonly kind: string; readonly id: string }[]
  readonly modifiedFiles: readonly string[]
}

export interface MultiAgentMissionRuntimeOptions {
  readonly workspaceRoot: string
  readonly executor: SpecialistAgentExecutor
  readonly maxConcurrency?: number
  readonly now?: () => Date
}

export class MultiAgentMissionRuntime {
  readonly #store: MultiAgentMissionStore
  readonly #executor: SpecialistAgentExecutor
  readonly #maxConcurrency: number
  readonly #now: () => Date

  constructor(options: MultiAgentMissionRuntimeOptions) {
    if (!Number.isInteger(options.maxConcurrency ?? 4) || (options.maxConcurrency ?? 4) < 1) {
      throw new Error('maxConcurrency must be a positive integer.')
    }
    this.#store = new MultiAgentMissionStore(options.workspaceRoot)
    this.#executor = options.executor
    this.#maxConcurrency = options.maxConcurrency ?? 4
    this.#now = options.now ?? (() => new Date())
  }

  async initialize(input: {
    readonly missionId: string
    readonly objective: string
    readonly tasks: readonly AutonomousTaskNode[]
  }): Promise<MultiAgentMissionState> {
    const timestamp = this.#now().toISOString()
    const assignments = input.tasks.map((task) => ({
      agentId: `${roleForTask(task)}-${task.id}`,
      role: roleForTask(task),
      taskId: task.id,
      status: 'idle' as const,
      evidence: [],
      diagnostics: [],
      modifiedFiles: [],
    }))
    const state: MultiAgentMissionState = {
      schemaVersion: 1,
      missionId: input.missionId,
      objective: input.objective,
      createdAt: timestamp,
      updatedAt: timestamp,
      assignments,
    }
    await this.#store.save(state)
    return state
  }

  async run(
    missionId: string,
    tasks: readonly AutonomousTaskNode[],
  ): Promise<MultiAgentMissionState> {
    if (tasks.length === 0) throw new Error('At least one task is required.')
    let state = await this.#store.load(missionId)
    const taskMap = new Map(tasks.map((task) => [task.id, task]))

    while (true) {
      const ready = state.assignments
        .filter((assignment) => assignment.status === 'idle')
        .filter((assignment) => dependenciesComplete(assignment.taskId, tasks, state))
        .filter((assignment) => !hasWriteConflict(assignment.taskId, tasks, state))
        .slice(0, this.#maxConcurrency)

      if (ready.length === 0) break

      state = await this.#updateAssignments(
        state,
        ready.map((item) => item.taskId),
        'running',
      )
      const sharedContext = createSharedContext(state)
      const results = await Promise.all(
        ready.map(async (assignment) => {
          const task = taskMap.get(assignment.taskId)
          if (task === undefined) throw new Error(`Task ${assignment.taskId} is missing.`)
          try {
            return {
              assignment,
              result: await this.#executor.execute({
                role: assignment.role,
                task,
                sharedContext,
              }),
            }
          } catch (error) {
            return {
              assignment,
              result: {
                state: 'failed' as const,
                diagnostics: [error instanceof Error ? error.message : String(error)],
              },
            }
          }
        }),
      )

      const timestamp = this.#now().toISOString()
      const byTask = new Map(results.map((entry) => [entry.assignment.taskId, entry.result]))
      state = {
        ...state,
        updatedAt: timestamp,
        assignments: state.assignments.map((assignment) => {
          const result = byTask.get(assignment.taskId)
          if (result === undefined) return assignment
          return {
            ...assignment,
            status:
              result.state === 'completed'
                ? 'completed'
                : result.state === 'blocked'
                  ? 'waiting'
                  : 'failed',
            completedAt: timestamp,
            evidence: result.evidence ?? [],
            diagnostics: result.diagnostics ?? [],
            modifiedFiles: result.modifiedFiles ?? [],
          }
        }),
      }
      await this.#store.save(state)
      if (results.some((entry) => entry.result.state === 'failed')) break
    }

    return state
  }

  async load(missionId: string): Promise<MultiAgentMissionState> {
    return this.#store.load(missionId)
  }

  async #updateAssignments(
    state: MultiAgentMissionState,
    taskIds: readonly string[],
    status: SpecialistAgentStatus,
  ): Promise<MultiAgentMissionState> {
    const timestamp = this.#now().toISOString()
    const selected = new Set(taskIds)
    const next = {
      ...state,
      updatedAt: timestamp,
      assignments: state.assignments.map((assignment) =>
        selected.has(assignment.taskId)
          ? { ...assignment, status, startedAt: assignment.startedAt ?? timestamp }
          : assignment,
      ),
    }
    await this.#store.save(next)
    return next
  }
}

export class MultiAgentMissionStore {
  readonly #root: string

  constructor(workspaceRoot: string) {
    this.#root = path.join(workspaceRoot, '.symbolwright', 'multi-agent-missions')
  }

  async save(state: MultiAgentMissionState): Promise<void> {
    await mkdir(this.#root, { recursive: true })
    const destination = this.#path(state.missionId)
    const temporary = `${destination}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    await rename(temporary, destination)
  }

  async load(missionId: string): Promise<MultiAgentMissionState> {
    return JSON.parse(await readFile(this.#path(missionId), 'utf8')) as MultiAgentMissionState
  }

  #path(missionId: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(missionId)) throw new Error(`Invalid mission ID: ${missionId}`)
    return path.join(this.#root, `${missionId}.json`)
  }
}

function roleForTask(task: AutonomousTaskNode): SpecialistAgentRole {
  if (task.kind === 'edit-session') return 'code-editor'
  if (task.kind === 'repair') return 'repair-agent'
  if (task.kind === 'validation') return 'test-runner'
  if (task.kind === 'documentation') return 'documentation-agent'
  if (/pull request|pr summary/i.test(task.objective)) return 'pr-summary-agent'
  if (/plan|decompose/i.test(task.objective)) return 'planner'
  return 'repository-analyst'
}

function dependenciesComplete(
  taskId: string,
  tasks: readonly AutonomousTaskNode[],
  state: MultiAgentMissionState,
): boolean {
  const task = tasks.find((candidate) => candidate.id === taskId)
  if (task === undefined) return false
  const completed = new Set(
    state.assignments
      .filter((assignment) => assignment.status === 'completed')
      .map((assignment) => assignment.taskId),
  )
  return task.dependencies.every((dependency) => completed.has(dependency))
}

function hasWriteConflict(
  taskId: string,
  tasks: readonly AutonomousTaskNode[],
  state: MultiAgentMissionState,
): boolean {
  const task = tasks.find((candidate) => candidate.id === taskId)
  if (task === undefined || task.resources.writes.length === 0) return false
  const running = new Set(
    state.assignments
      .filter((assignment) => assignment.status === 'running')
      .map((assignment) => assignment.taskId),
  )
  return tasks.some(
    (candidate) =>
      running.has(candidate.id) &&
      candidate.resources.writes.some((file) => task.resources.writes.includes(file)),
  )
}

function createSharedContext(state: MultiAgentMissionState): MultiAgentSharedContext {
  const completed = state.assignments.filter((assignment) => assignment.status === 'completed')
  return {
    missionId: state.missionId,
    objective: state.objective,
    completedTaskIds: completed.map((assignment) => assignment.taskId),
    evidence: completed.flatMap((assignment) => assignment.evidence),
    modifiedFiles: [...new Set(completed.flatMap((assignment) => assignment.modifiedFiles))].sort(),
  }
}
