import type { AutonomousRepairLoopRecord } from './autonomous-repair-loop.js'
import type { PersistedMissionExecution } from './persistent-mission-executor.js'
import type { AutonomousTaskState } from './task-graph.types.js'

export interface MissionDashboardTaskSummary {
  readonly id: string
  readonly objective: string
  readonly state: AutonomousTaskState
  readonly attempts: number
  readonly dependencies: readonly string[]
}

export interface MissionDashboardProjection {
  readonly missionId: string
  readonly objective: string
  readonly status: 'running' | 'blocked' | 'failed' | 'completed' | 'interrupted'
  readonly taskCounts: Readonly<Record<AutonomousTaskState, number>>
  readonly tasks: readonly MissionDashboardTaskSummary[]
  readonly currentValidationPhase?: string | undefined
  readonly repairAttemptCount: number
  readonly modifiedFiles: readonly string[]
  readonly timeline: readonly {
    readonly timestamp: string
    readonly label: string
  }[]
  readonly startedAt: string
  readonly updatedAt: string
  readonly completedAt?: string | undefined
  readonly durationMs: number
  readonly estimatedCompletionMs?: number | undefined
}

export function projectMissionDashboard(input: {
  readonly execution: PersistedMissionExecution
  readonly repairLoop?: AutonomousRepairLoopRecord | undefined
  readonly now?: string | undefined
}): MissionDashboardProjection {
  const now = input.now ?? new Date().toISOString()
  const taskCounts = createTaskCounts()
  for (const task of input.execution.graph.tasks) taskCounts[task.state] += 1

  const currentValidationPhase = input.repairLoop?.state === 'validating'
    ? nextValidationPhase(input.repairLoop)
    : undefined
  const timeline = buildTimeline(input.execution, input.repairLoop)
  const status = deriveStatus(input.execution)
  const elapsedMs = Math.max(0, Date.parse(now) - Date.parse(input.execution.startedAt))
  const completedTasks = taskCounts.completed
  const totalTasks = input.execution.graph.tasks.length
  const estimatedCompletionMs =
    status === 'running' && completedTasks > 0 && completedTasks < totalTasks
      ? Math.round((elapsedMs / completedTasks) * (totalTasks - completedTasks))
      : undefined

  return {
    missionId: input.execution.graph.missionId,
    objective: input.execution.graph.objective,
    status,
    taskCounts,
    tasks: input.execution.graph.tasks.map((task) => ({
      id: task.id,
      objective: task.objective,
      state: task.state,
      attempts: task.retry.attempts,
      dependencies: task.dependencies,
    })),
    currentValidationPhase,
    repairAttemptCount: input.repairLoop?.repairAttempts.length ?? 0,
    modifiedFiles: [
      ...new Set([
        ...input.execution.modifiedFiles,
        ...(input.repairLoop?.modifiedFiles ?? []),
      ]),
    ].sort(),
    timeline,
    startedAt: input.execution.startedAt,
    updatedAt: input.execution.updatedAt,
    ...(input.execution.completedAt === undefined
      ? {}
      : { completedAt: input.execution.completedAt }),
    durationMs: input.execution.completedAt === undefined
      ? elapsedMs
      : Math.max(
          0,
          Date.parse(input.execution.completedAt) - Date.parse(input.execution.startedAt),
        ),
    ...(estimatedCompletionMs === undefined ? {} : { estimatedCompletionMs }),
  }
}

function createTaskCounts(): Record<AutonomousTaskState, number> {
  return {
    queued: 0,
    blocked: 0,
    ready: 0,
    running: 0,
    validating: 0,
    repairing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    interrupted: 0,
  }
}

function deriveStatus(execution: PersistedMissionExecution): MissionDashboardProjection['status'] {
  if (execution.completedAt !== undefined) {
    return execution.graph.tasks.some((task) => task.state === 'failed') ? 'failed' : 'completed'
  }
  if (execution.graph.tasks.some((task) => task.state === 'failed')) return 'failed'
  if (execution.graph.tasks.some((task) => task.state === 'blocked')) return 'blocked'
  if (execution.graph.tasks.some((task) => task.state === 'interrupted')) return 'interrupted'
  return 'running'
}

function nextValidationPhase(repairLoop: AutonomousRepairLoopRecord): string | undefined {
  for (let index = 0; index < repairLoop.validationCommands.length; index += 1) {
    const phase = `validation-${index + 1}`
    if (!repairLoop.completedPhases.includes(phase)) return phase
  }
  return undefined
}

function buildTimeline(
  execution: PersistedMissionExecution,
  repairLoop?: AutonomousRepairLoopRecord,
): MissionDashboardProjection['timeline'] {
  const entries: { timestamp: string; label: string }[] = [
    { timestamp: execution.startedAt, label: 'Mission started' },
  ]
  for (const task of execution.graph.tasks) {
    if (task.startedAt !== undefined) {
      entries.push({ timestamp: task.startedAt, label: `Task started: ${task.objective}` })
    }
    if (task.completedAt !== undefined) {
      entries.push({ timestamp: task.completedAt, label: `Task completed: ${task.objective}` })
    }
  }
  for (const attempt of repairLoop?.repairAttempts ?? []) {
    entries.push({
      timestamp: attempt.startedAt,
      label: `Repair attempt ${attempt.attempt} started`,
    })
    entries.push({
      timestamp: attempt.completedAt,
      label: `Repair attempt ${attempt.attempt} completed`,
    })
  }
  if (execution.completedAt !== undefined) {
    entries.push({ timestamp: execution.completedAt, label: 'Mission completed' })
  }
  return entries.sort((left, right) => left.timestamp.localeCompare(right.timestamp))
}
