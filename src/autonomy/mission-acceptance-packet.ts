import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { MissionImpactIntelligence } from './mission-impact-intelligence.js'
import type { PersistedMissionExecution } from './persistent-mission-executor.js'

export type MissionAcceptanceStatus = 'accepted' | 'blocked' | 'failed' | 'incomplete'

export interface MissionAcceptancePacket {
  readonly schemaVersion: 1
  readonly missionId: string
  readonly objective: string
  readonly status: MissionAcceptanceStatus
  readonly generatedAt: string
  readonly startedAt: string
  readonly completedAt?: string
  readonly durationMs: number
  readonly modifiedFiles: readonly string[]
  readonly taskSummary: {
    readonly total: number
    readonly completed: number
    readonly failed: number
    readonly blocked: number
    readonly cancelled: number
    readonly unfinished: number
    readonly attempts: number
  }
  readonly validation: {
    readonly passed: boolean
    readonly completedPhases: readonly string[]
    readonly failedPhases: readonly string[]
  }
  readonly intelligence: MissionImpactIntelligence | null
  readonly evidence: readonly {
    readonly taskId: string
    readonly taskObjective: string
    readonly kind: string
    readonly id: string
  }[]
  readonly diagnostics: readonly {
    readonly taskId: string
    readonly messages: readonly string[]
  }[]
  readonly artifacts: readonly {
    readonly taskId: string
    readonly values: readonly string[]
  }[]
  readonly pullRequest: {
    readonly title: string
    readonly body: string
  }
}

export function createMissionAcceptancePacket(input: {
  readonly execution: PersistedMissionExecution
  readonly intelligence?: MissionImpactIntelligence
  readonly generatedAt?: string
}): MissionAcceptancePacket {
  const { execution } = input
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const tasks = execution.graph.tasks
  const completed = tasks.filter((task) => task.state === 'completed')
  const failed = tasks.filter((task) => task.state === 'failed')
  const blocked = tasks.filter((task) => task.state === 'blocked')
  const cancelled = tasks.filter((task) => task.state === 'cancelled')
  const unfinished = tasks.filter(
    (task) => !['completed', 'failed', 'blocked', 'cancelled'].includes(task.state),
  )
  const validationTasks = tasks.filter((task) => task.kind === 'validation')
  const completedValidation = validationTasks.filter((task) => task.state === 'completed')
  const failedValidation = validationTasks.filter((task) => task.state === 'failed')
  const status = deriveAcceptanceStatus({ failed, blocked, unfinished, execution })

  const taskSummary = {
    total: tasks.length,
    completed: completed.length,
    failed: failed.length,
    blocked: blocked.length,
    cancelled: cancelled.length,
    unfinished: unfinished.length,
    attempts: tasks.reduce((sum, task) => sum + task.retry.attempts, 0),
  }

  const evidence = tasks.flatMap((task) =>
    task.evidence.map((entry) => ({
      taskId: task.id,
      taskObjective: task.objective,
      kind: entry.kind,
      id: entry.id,
    })),
  )
  const diagnostics = tasks
    .filter((task) => task.failureDiagnostics.length > 0)
    .map((task) => ({ taskId: task.id, messages: task.failureDiagnostics }))
  const artifacts = tasks
    .filter((task) => task.artifacts.length > 0)
    .map((task) => ({ taskId: task.id, values: task.artifacts }))

  const packetBase = {
    schemaVersion: 1 as const,
    missionId: execution.graph.missionId,
    objective: execution.graph.objective,
    status,
    generatedAt,
    startedAt: execution.startedAt,
    ...(execution.completedAt === undefined ? {} : { completedAt: execution.completedAt }),
    durationMs: Math.max(
      0,
      Date.parse(execution.completedAt ?? generatedAt) - Date.parse(execution.startedAt),
    ),
    modifiedFiles: execution.modifiedFiles,
    taskSummary,
    validation: {
      passed:
        validationTasks.length > 0 &&
        completedValidation.length === validationTasks.length &&
        failedValidation.length === 0,
      completedPhases: completedValidation.map((task) => task.objective),
      failedPhases: failedValidation.map((task) => task.objective),
    },
    intelligence: input.intelligence ?? null,
    evidence,
    diagnostics,
    artifacts,
  }

  return {
    ...packetBase,
    pullRequest: {
      title: pullRequestTitle(packetBase),
      body: pullRequestBody(packetBase),
    },
  }
}

export class MissionAcceptancePacketStore {
  readonly #root: string

  constructor(workspaceRoot: string) {
    this.#root = path.resolve(workspaceRoot, '.codemind', 'autonomy', 'acceptance')
  }

  async save(packet: MissionAcceptancePacket): Promise<string> {
    await mkdir(this.#root, { recursive: true })
    const destination = path.join(this.#root, `${validateId(packet.missionId)}.json`)
    const temporary = `${destination}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(packet, null, 2)}\n`, { mode: 0o600 })
    await rename(temporary, destination)
    return destination
  }
}

function deriveAcceptanceStatus(input: {
  readonly failed: readonly unknown[]
  readonly blocked: readonly unknown[]
  readonly unfinished: readonly unknown[]
  readonly execution: PersistedMissionExecution
}): MissionAcceptanceStatus {
  if (input.failed.length > 0) return 'failed'
  if (input.blocked.length > 0) return 'blocked'
  if (input.unfinished.length > 0 || input.execution.completedAt === undefined) return 'incomplete'
  return 'accepted'
}

function pullRequestTitle(packet: Omit<MissionAcceptancePacket, 'pullRequest'>): string {
  const mergeReady =
    packet.intelligence === null || packet.intelligence.mergeReadiness.decision === 'ready'
  const prefix = packet.status === 'accepted' && mergeReady ? 'feat' : 'chore'
  return `${prefix}(agent): complete mission ${packet.missionId}`
}

function pullRequestBody(packet: Omit<MissionAcceptancePacket, 'pullRequest'>): string {
  const modifiedFiles =
    packet.modifiedFiles.length === 0
      ? '- None recorded'
      : packet.modifiedFiles.map((file) => `- \`${file}\``).join('\n')
  const diagnostics =
    packet.diagnostics.length === 0
      ? '- None'
      : packet.diagnostics
          .flatMap((entry) => entry.messages.map((message) => `- ${entry.taskId}: ${message}`))
          .join('\n')
  const intelligence = packet.intelligence
  const readiness =
    intelligence === null
      ? '- Merge readiness: unavailable (semantic index was not loaded)'
      : [
          `- Merge readiness: **${intelligence.mergeReadiness.decision}**`,
          `- Readiness score: ${intelligence.mergeReadiness.score}/100`,
          `- Repository impact: ${intelligence.impact.risk} (${intelligence.impact.riskScore}/100)`,
          `- Directly affected files: ${intelligence.impact.directlyAffectedFiles.length}`,
          `- Transitively affected files: ${intelligence.impact.transitivelyAffectedFiles.length}`,
          `- Affected packages: ${intelligence.impact.affectedPackages.length}`,
        ].join('\n')
  const readinessReasons =
    intelligence === null
      ? '- None available'
      : intelligence.mergeReadiness.reasons.map((reason) => `- ${reason}`).join('\n')

  return [
    '## Autonomous Mission',
    '',
    packet.objective,
    '',
    '## Acceptance',
    '',
    `- Status: **${packet.status}**`,
    `- Tasks completed: ${packet.taskSummary.completed}/${packet.taskSummary.total}`,
    `- Validation passed: ${packet.validation.passed ? 'yes' : 'no'}`,
    `- Evidence records: ${packet.evidence.length}`,
    `- Total attempts: ${packet.taskSummary.attempts}`,
    '',
    '## Repository Intelligence',
    '',
    readiness,
    '',
    '### Readiness Reasons',
    '',
    readinessReasons,
    '',
    '## Modified Files',
    '',
    modifiedFiles,
    '',
    '## Diagnostics',
    '',
    diagnostics,
    '',
    '## Evidence',
    '',
    'Generated from CodeMind persisted mission execution state. Completion is not inferred from agent narration.',
  ].join('\n')
}

function validateId(value: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) throw new Error(`Invalid mission ID: ${value}`)
  return value
}
