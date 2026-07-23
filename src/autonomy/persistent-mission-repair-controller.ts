import path from 'node:path'

import type { ProjectMemory, ProjectMemoryEntry } from '../memory/project-memory.js'
import type {
  AutonomousRepairAttempt,
  AutonomousRepairLoopRecord,
  AutonomousRepairLoopStore,
  AutonomousValidationResult,
} from './autonomous-repair-loop.js'
import type {
  MissionTaskExecutionResult,
  MissionTaskRepairInput,
} from './persistent-mission-executor.js'
import type {
  AutonomousEditExecutionContext,
  AutonomousEditTaskExecutor,
} from './runtime-mission-task-executor.js'
import type { AutonomousTaskNode } from './task-graph.types.js'

export interface PersistentMissionRepairControllerOptions {
  readonly store: AutonomousRepairLoopStore
  readonly editExecutor: AutonomousEditTaskExecutor
  readonly projectMemory: ProjectMemory
  readonly missionId: string
  readonly objective: string
  readonly repositoryRoot: string
  readonly validationCommands: readonly string[]
  readonly maxRepairAttempts?: number
  readonly now?: () => Date
  readonly recordEvent?: (
    type: string,
    summary: string,
    payload?: Readonly<Record<string, unknown>>,
  ) => void
}

export class PersistentMissionRepairController {
  readonly #store: AutonomousRepairLoopStore
  readonly #editExecutor: AutonomousEditTaskExecutor
  readonly #projectMemory: ProjectMemory
  readonly #missionId: string
  readonly #objective: string
  readonly #repositoryRoot: string
  readonly #validationCommands: readonly string[]
  readonly #maxRepairAttempts: number
  readonly #now: () => Date
  readonly #recordEvent:
    | ((type: string, summary: string, payload?: Readonly<Record<string, unknown>>) => void)
    | undefined

  constructor(options: PersistentMissionRepairControllerOptions) {
    const maxRepairAttempts = options.maxRepairAttempts ?? 3
    if (!Number.isInteger(maxRepairAttempts) || maxRepairAttempts < 0 || maxRepairAttempts > 10) {
      throw new Error('maxRepairAttempts must be an integer between 0 and 10.')
    }
    if (options.validationCommands.length === 0) {
      throw new Error('Persistent mission repair requires at least one validation command.')
    }

    this.#store = options.store
    this.#editExecutor = options.editExecutor
    this.#projectMemory = options.projectMemory
    this.#missionId = options.missionId
    this.#objective = options.objective
    this.#repositoryRoot = path.resolve(options.repositoryRoot)
    this.#validationCommands = [...options.validationCommands]
    this.#maxRepairAttempts = maxRepairAttempts
    this.#now = options.now ?? (() => new Date())
    this.#recordEvent = options.recordEvent
  }

  async load(): Promise<AutonomousRepairLoopRecord | undefined> {
    return this.#store.load(this.#loopId())
  }

  async recordValidation(
    task: AutonomousTaskNode,
    result: AutonomousValidationResult,
  ): Promise<AutonomousRepairLoopRecord> {
    const record = await this.#loadOrCreate()
    const timestamp = this.#now().toISOString()
    const completedPhases = result.passed
      ? [...new Set([...record.completedPhases, task.id])]
      : []
    const allPassed = this.#validationCommands.every((_, index) =>
      completedPhases.includes(`validate-${index + 1}`),
    )
    const { error: _error, completedAt: _completedAt, ...activeRecord } = record
    const updated: AutonomousRepairLoopRecord = {
      ...activeRecord,
      state: result.passed ? (allPassed ? 'completed' : 'validating') : 'repairing',
      completedPhases,
      validationResults: [...record.validationResults, result],
      updatedAt: timestamp,
      ...(allPassed ? { completedAt: timestamp } : {}),
    }
    await this.#store.save(updated)

    this.#recordEvent?.(
      result.passed ? 'autonomy.validation.passed' : 'autonomy.validation.failed',
      result.passed
        ? `Autonomous validation passed: ${result.command}`
        : `Autonomous validation failed: ${result.command}`,
      {
        taskId: task.id,
        command: result.command,
        durationMs: result.durationMs,
        exitCode: result.exitCode,
      },
    )

    if (allPassed && updated.repairAttempts.length > 0) {
      this.#learnSuccessfulRepair(updated)
    }
    return updated
  }

  async repair(input: MissionTaskRepairInput): Promise<MissionTaskExecutionResult> {
    const record = await this.#loadOrCreate()
    const latestFailure = [...record.validationResults].reverse().find((result) => !result.passed)
    if (latestFailure === undefined) {
      return this.#terminalFailure(record, 'No failed validation result is available for repair.')
    }

    if (record.repairAttempts.length >= record.maxRepairAttempts) {
      return this.#terminalFailure(
        record,
        `Repair retry limit reached after ${record.repairAttempts.length} attempts.`,
      )
    }

    const attempt = record.repairAttempts.length + 1
    const startedAt = this.#now().toISOString()
    const diagnosis = diagnoseFailure(latestFailure)
    const memoryEntries = this.#relevantMemory()
    const errorMemory = this.#projectMemory.learn({
      category: 'error_pattern',
      key: failureKey(latestFailure),
      value: diagnosis.join(' | '),
      confidence: Math.min(0.95, 0.6 + attempt * 0.05),
      source: `autonomous-repair:${this.#missionId}`,
    })
    const repairTask = buildRepairTask({
      missionId: this.#missionId,
      objective: this.#objective,
      attempt,
      failure: latestFailure,
      diagnosis,
      memoryEntries,
      writeScope: repairWriteScope(input),
      now: startedAt,
    })
    const context: AutonomousEditExecutionContext = {
      ownedBaselineFiles: input.execution.modifiedFiles,
    }

    const { error: _error, completedAt: _completedAt, ...activeRecord } = record
    await this.#store.save({
      ...activeRecord,
      state: 'repairing',
      updatedAt: startedAt,
    })
    this.#recordEvent?.('autonomy.repair.started', `Repair attempt ${attempt} started.`, {
      attempt,
      validationTaskId: input.validationTask.id,
      failedCommand: latestFailure.command,
      recalledMemoryEntries: memoryEntries.map((entry) => entry.id),
    })

    let result: MissionTaskExecutionResult
    try {
      result = await this.#editExecutor.execute(repairTask, context)
    } catch (error) {
      result = {
        state: 'failed',
        diagnostics: [errorMessage(error)],
        evidence: [{ kind: 'diagnostic', id: `repair-exception-${attempt}` }],
      }
    }

    const completedAt = this.#now().toISOString()
    const repairAttempt: AutonomousRepairAttempt = {
      attempt,
      startedAt,
      completedAt,
      failedValidation: latestFailure,
      diagnosis,
      editSessionId: repairTask.id,
      editState: repairEditState(result.state),
      executorState: result.state,
      modifiedFiles: result.modifiedFiles ?? [],
      evidenceIds: (result.evidence ?? []).map((evidence) => evidence.id),
      memoryEntryIds: [errorMemory.id, ...memoryEntries.map((entry) => entry.id)],
    }
    const modifiedFiles = [
      ...new Set([...record.modifiedFiles, ...(result.modifiedFiles ?? [])]),
    ].sort()
    const succeeded = result.state === 'completed'
    const error = succeeded
      ? undefined
      : result.diagnostics?.join(' | ') || `Repair attempt ended in state ${result.state}.`
    const updated: AutonomousRepairLoopRecord = {
      ...activeRecord,
      state: succeeded ? 'validating' : 'failed',
      completedPhases: [],
      repairAttempts: [...record.repairAttempts, repairAttempt],
      modifiedFiles,
      updatedAt: completedAt,
      ...(error === undefined ? {} : { error, completedAt }),
    }
    await this.#store.save(updated)

    if (succeeded) {
      this.#recordEvent?.('autonomy.repair.applied', `Repair attempt ${attempt} applied.`, {
        attempt,
        modifiedFiles: result.modifiedFiles ?? [],
        evidenceCount: result.evidence?.length ?? 0,
      })
      return result
    }

    this.#projectMemory.learn({
      category: 'review_lesson',
      key: `failed-repair:${failureKey(latestFailure)}`,
      value: `Attempt ${attempt} ended in ${result.state}: ${error}`,
      confidence: 0.55,
      source: `autonomous-repair:${this.#missionId}`,
    })
    this.#recordEvent?.('autonomy.repair.failed', `Repair attempt ${attempt} failed.`, {
      attempt,
      state: result.state,
      diagnostics: result.diagnostics ?? [],
    })
    return result
  }

  async #loadOrCreate(): Promise<AutonomousRepairLoopRecord> {
    const existing = await this.#store.load(this.#loopId())
    if (existing !== undefined) return existing

    const now = this.#now().toISOString()
    const record: AutonomousRepairLoopRecord = {
      schemaVersion: 1,
      id: this.#loopId(),
      missionId: this.#missionId,
      objective: this.#objective,
      repositoryRoot: this.#repositoryRoot,
      state: 'planned',
      validationCommands: this.#validationCommands,
      maxRepairAttempts: this.#maxRepairAttempts,
      completedPhases: [],
      validationResults: [],
      repairAttempts: [],
      modifiedFiles: [],
      createdAt: now,
      updatedAt: now,
    }
    await this.#store.save(record)
    return record
  }

  async #terminalFailure(
    record: AutonomousRepairLoopRecord,
    message: string,
  ): Promise<MissionTaskExecutionResult> {
    const completedAt = this.#now().toISOString()
    const failed: AutonomousRepairLoopRecord = {
      ...record,
      state: 'failed',
      error: message,
      updatedAt: completedAt,
      completedAt,
    }
    await this.#store.save(failed)
    this.#projectMemory.learn({
      category: 'review_lesson',
      key: `repair-exhausted:${this.#missionId}`,
      value: message,
      confidence: 0.7,
      source: `autonomous-repair:${this.#missionId}`,
    })
    this.#recordEvent?.('autonomy.repair.exhausted', message, {
      attempts: record.repairAttempts.length,
      maxRepairAttempts: record.maxRepairAttempts,
    })
    return {
      state: 'failed',
      diagnostics: [message],
      evidence: [{ kind: 'diagnostic', id: `repair-exhausted-${this.#missionId}` }],
    }
  }

  #relevantMemory(): readonly ProjectMemoryEntry[] {
    return this.#projectMemory
      .query({ minConfidence: 0.45, limit: 20 })
      .filter((entry) =>
        ['error_pattern', 'test_pattern', 'dependency_note', 'review_lesson'].includes(
          entry.category,
        ),
      )
      .slice(0, 10)
  }

  #learnSuccessfulRepair(record: AutonomousRepairLoopRecord): void {
    const changedFiles = record.modifiedFiles.join(', ') || 'the mission change set'
    const attempts = record.repairAttempts.length
    for (const result of record.validationResults.filter((validation) => validation.passed)) {
      this.#projectMemory.learn({
        category: 'test_pattern',
        key: `validation:${result.command}`,
        value: `Use ${result.command} to verify changes affecting ${changedFiles}.`,
        confidence: 0.85,
        source: `autonomous-repair:${this.#missionId}`,
      })
    }
    this.#projectMemory.learn({
      category: 'review_lesson',
      key: `successful-repair:${this.#missionId}`,
      value: `Validation recovered after ${attempts} repair attempt${attempts === 1 ? '' : 's'}; changed ${changedFiles}.`,
      confidence: 0.9,
      source: `autonomous-repair:${this.#missionId}`,
    })
    this.#recordEvent?.('autonomy.repair.learned', 'Repository repair lessons recorded.', {
      attempts,
      modifiedFiles: record.modifiedFiles,
    })
  }

  #loopId(): string {
    return `repair-${this.#missionId}`
  }
}

function buildRepairTask(input: {
  readonly missionId: string
  readonly objective: string
  readonly attempt: number
  readonly failure: AutonomousValidationResult
  readonly diagnosis: readonly string[]
  readonly memoryEntries: readonly ProjectMemoryEntry[]
  readonly writeScope: readonly string[]
  readonly now: string
}): AutonomousTaskNode {
  const memory =
    input.memoryEntries.length === 0
      ? '(no prior repository repair lessons)'
      : input.memoryEntries
          .map((entry) => `- [${entry.category}] ${entry.key}: ${entry.value}`)
          .join('\n')
  return {
    id: `repair-${input.failure.phase}-${input.attempt}`,
    objective: [
      `Repair the repository so the failed validation passes without weakening the check.`,
      `Mission objective: ${input.objective}`,
      `Failed command: ${input.failure.command}`,
      `Exit code: ${String(input.failure.exitCode)}`,
      `Diagnosis: ${input.diagnosis.join(' | ')}`,
      '',
      'Relevant repository memory:',
      memory,
      '',
      'Inspect the failure, apply the smallest complete multi-file fix, preserve existing mission changes, and do not disable tests, lint, type checking, or build gates.',
    ].join('\n'),
    kind: 'repair',
    dependencies: [],
    resources: { reads: ['**/*'], writes: input.writeScope },
    state: 'ready',
    retry: { maxAttempts: 1, attempts: 0 },
    evidence: [],
    artifacts: [],
    failureDiagnostics: [],
    createdAt: input.now,
    updatedAt: input.now,
  }
}

function repairWriteScope(input: MissionTaskRepairInput): readonly string[] {
  const files = new Set(input.execution.modifiedFiles)
  for (const task of input.execution.graph.tasks) {
    if (task.kind !== 'edit-session' && task.kind !== 'repair') continue
    for (const file of task.resources.writes) {
      if (isConcretePath(file)) files.add(normalizePath(file))
    }
  }
  return [...files].filter((file) => file.length > 0).sort()
}

function isConcretePath(value: string): boolean {
  return !value.includes('*') && !value.includes('?') && !value.includes('{')
}

function normalizePath(value: string): string {
  return path.posix.normalize(value.replaceAll('\\', '/').replace(/^\.\//, ''))
}

function diagnoseFailure(failure: AutonomousValidationResult): readonly string[] {
  const output = [failure.stderr, failure.stdout]
    .flatMap((value) => value.split('\n'))
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(-8)
  return output.length === 0
    ? [`${failure.command} exited with code ${String(failure.exitCode)}.`]
    : output
}

function failureKey(failure: AutonomousValidationResult): string {
  const signature = diagnoseFailure(failure)[0] ?? 'unknown failure'
  return `${failure.command}:${signature}`.slice(0, 240)
}

function repairEditState(
  state: MissionTaskExecutionResult['state'],
): 'applied' | 'conflicted' | 'rolled-back' {
  if (state === 'completed') return 'applied'
  if (state === 'blocked') return 'conflicted'
  return 'rolled-back'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
