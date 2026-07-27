import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type {
  TransactionalEditSession,
  TransactionalEditSessionRecord,
  TransactionalFileEdit,
} from './transactional-edit-session.js'

export type AutonomousRepairLoopState =
  'planned' | 'validating' | 'repairing' | 'completed' | 'failed' | 'interrupted'

export interface AutonomousValidationResult {
  readonly phase: string
  readonly command: string
  readonly passed: boolean
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
  readonly durationMs: number
}

export interface AutonomousRepairAttempt {
  readonly attempt: number
  readonly startedAt: string
  readonly completedAt: string
  readonly failedValidation: AutonomousValidationResult
  readonly diagnosis: readonly string[]
  readonly editSessionId?: string | undefined
  readonly editState?: TransactionalEditSessionRecord['state'] | undefined
  readonly executorState?: 'completed' | 'failed' | 'blocked' | undefined
  readonly modifiedFiles?: readonly string[] | undefined
  readonly evidenceIds?: readonly string[] | undefined
  readonly memoryEntryIds?: readonly string[] | undefined
}

export interface AutonomousRepairLoopRecord {
  readonly schemaVersion: 1
  readonly id: string
  readonly missionId: string
  readonly objective: string
  readonly repositoryRoot: string
  readonly state: AutonomousRepairLoopState
  readonly validationCommands: readonly string[]
  readonly maxRepairAttempts: number
  readonly completedPhases: readonly string[]
  readonly validationResults: readonly AutonomousValidationResult[]
  readonly repairAttempts: readonly AutonomousRepairAttempt[]
  readonly modifiedFiles: readonly string[]
  readonly error?: string | undefined
  readonly createdAt: string
  readonly updatedAt: string
  readonly completedAt?: string | undefined
}

export interface AutonomousRepairLoopStore {
  load(loopId: string): Promise<AutonomousRepairLoopRecord | undefined>
  save(record: AutonomousRepairLoopRecord): Promise<void>
}

export interface AutonomousValidationRunner {
  run(input: {
    readonly repositoryRoot: string
    readonly phase: string
    readonly command: string
  }): Promise<AutonomousValidationResult>
}

export interface AutonomousRepairStrategy {
  diagnose(input: {
    readonly objective: string
    readonly repositoryRoot: string
    readonly failure: AutonomousValidationResult
    readonly attempt: number
  }): Promise<readonly string[]>
  proposeEdits(input: {
    readonly objective: string
    readonly repositoryRoot: string
    readonly failure: AutonomousValidationResult
    readonly diagnosis: readonly string[]
    readonly attempt: number
  }): Promise<readonly TransactionalFileEdit[]>
}

export class JsonAutonomousRepairLoopStore implements AutonomousRepairLoopStore {
  readonly #root: string

  constructor(workspaceRoot: string) {
    this.#root = path.resolve(workspaceRoot, '.symbolwright', 'autonomy', 'repair-loops')
  }

  async load(loopId: string): Promise<AutonomousRepairLoopRecord | undefined> {
    try {
      const raw = await readFile(path.join(this.#root, `${validateId(loopId)}.json`), 'utf8')
      return JSON.parse(raw) as AutonomousRepairLoopRecord
    } catch (error) {
      if (isMissing(error)) return undefined
      throw error
    }
  }

  async save(record: AutonomousRepairLoopRecord): Promise<void> {
    await mkdir(this.#root, { recursive: true })
    const destination = path.join(this.#root, `${validateId(record.id)}.json`)
    const temporary = `${destination}.${randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 })
    await rename(temporary, destination)
  }
}

export class AutonomousRepairLoop {
  readonly #store: AutonomousRepairLoopStore
  readonly #editSessions: TransactionalEditSession
  readonly #validationRunner: AutonomousValidationRunner
  readonly #repairStrategy: AutonomousRepairStrategy

  constructor(input: {
    readonly store: AutonomousRepairLoopStore
    readonly editSessions: TransactionalEditSession
    readonly validationRunner: AutonomousValidationRunner
    readonly repairStrategy: AutonomousRepairStrategy
  }) {
    this.#store = input.store
    this.#editSessions = input.editSessions
    this.#validationRunner = input.validationRunner
    this.#repairStrategy = input.repairStrategy
  }

  async create(input: {
    readonly missionId: string
    readonly objective: string
    readonly repositoryRoot: string
    readonly validationCommands: readonly string[]
    readonly maxRepairAttempts?: number | undefined
    readonly id?: string | undefined
    readonly now?: string | undefined
  }): Promise<AutonomousRepairLoopRecord> {
    if (input.validationCommands.length === 0) {
      throw new Error('An autonomous repair loop requires at least one validation command.')
    }
    const maxRepairAttempts = input.maxRepairAttempts ?? 3
    if (!Number.isInteger(maxRepairAttempts) || maxRepairAttempts < 0 || maxRepairAttempts > 10) {
      throw new Error('maxRepairAttempts must be an integer between 0 and 10.')
    }
    const now = input.now ?? new Date().toISOString()
    const record: AutonomousRepairLoopRecord = {
      schemaVersion: 1,
      id: input.id ?? `repair-${randomUUID()}`,
      missionId: input.missionId,
      objective: input.objective,
      repositoryRoot: path.resolve(input.repositoryRoot),
      state: 'planned',
      validationCommands: [...input.validationCommands],
      maxRepairAttempts,
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

  async resume(loopId: string): Promise<AutonomousRepairLoopRecord> {
    const record = await this.#store.load(loopId)
    if (!record) throw new Error(`Repair loop ${loopId} was not found.`)
    if (record.state === 'completed' || record.state === 'failed') return record
    return this.run({ ...record, state: 'interrupted' })
  }

  async run(record: AutonomousRepairLoopRecord): Promise<AutonomousRepairLoopRecord> {
    let current = record
    while (true) {
      const validation = await this.#runValidationPass(current)
      current = validation.record
      if (validation.failure === undefined) {
        const completedAt = new Date().toISOString()
        const completed = {
          ...current,
          state: 'completed' as const,
          updatedAt: completedAt,
          completedAt,
        }
        await this.#store.save(completed)
        return completed
      }

      if (current.repairAttempts.length >= current.maxRepairAttempts) {
        const failedAt = new Date().toISOString()
        const failed = {
          ...current,
          state: 'failed' as const,
          error: `Repair retry limit reached after ${current.repairAttempts.length} attempts.`,
          updatedAt: failedAt,
          completedAt: failedAt,
        }
        await this.#store.save(failed)
        return failed
      }

      current = await this.#repair(current, validation.failure)
      if (current.state === 'failed') return current
    }
  }

  async #runValidationPass(record: AutonomousRepairLoopRecord): Promise<{
    readonly record: AutonomousRepairLoopRecord
    readonly failure?: AutonomousValidationResult | undefined
  }> {
    let current = {
      ...record,
      state: 'validating' as const,
      updatedAt: new Date().toISOString(),
    }
    await this.#store.save(current)

    for (let index = 0; index < current.validationCommands.length; index += 1) {
      const phase = `validation-${index + 1}`
      if (current.completedPhases.includes(phase)) continue
      const command = current.validationCommands[index]
      if (command === undefined) continue
      const result = await this.#validationRunner.run({
        repositoryRoot: current.repositoryRoot,
        phase,
        command,
      })
      current = {
        ...current,
        validationResults: [...current.validationResults, result],
        completedPhases: result.passed
          ? [...current.completedPhases, phase]
          : current.completedPhases,
        updatedAt: new Date().toISOString(),
      }
      await this.#store.save(current)
      if (!result.passed) return { record: current, failure: result }
    }

    return { record: current }
  }

  async #repair(
    record: AutonomousRepairLoopRecord,
    failure: AutonomousValidationResult,
  ): Promise<AutonomousRepairLoopRecord> {
    const attempt = record.repairAttempts.length + 1
    const startedAt = new Date().toISOString()
    let current: AutonomousRepairLoopRecord = {
      ...record,
      state: 'repairing',
      updatedAt: startedAt,
    }
    await this.#store.save(current)

    try {
      const diagnosis = await this.#repairStrategy.diagnose({
        objective: current.objective,
        repositoryRoot: current.repositoryRoot,
        failure,
        attempt,
      })
      const edits = await this.#repairStrategy.proposeEdits({
        objective: current.objective,
        repositoryRoot: current.repositoryRoot,
        failure,
        diagnosis,
        attempt,
      })
      if (edits.length === 0) throw new Error('Repair strategy returned no edits.')

      const editSession = await this.#editSessions.create({
        missionId: current.missionId,
        repositoryRoot: current.repositoryRoot,
        edits,
      })
      const editResult = await this.#editSessions.apply(editSession)
      const completedAt = new Date().toISOString()
      const repairAttempt: AutonomousRepairAttempt = {
        attempt,
        startedAt,
        completedAt,
        failedValidation: failure,
        diagnosis,
        editSessionId: editResult.id,
        editState: editResult.state,
      }
      const modifiedFiles = new Set([...current.modifiedFiles, ...editResult.appliedPaths])
      current = {
        ...current,
        state: editResult.state === 'applied' ? 'validating' : 'failed',
        completedPhases: [],
        repairAttempts: [...current.repairAttempts, repairAttempt],
        modifiedFiles: [...modifiedFiles].sort(),
        error:
          editResult.state === 'applied'
            ? undefined
            : `Repair edit session ended in state ${editResult.state}.`,
        updatedAt: completedAt,
        ...(editResult.state === 'applied' ? {} : { completedAt }),
      }
      await this.#store.save(current)
      return current
    } catch (error) {
      const failedAt = new Date().toISOString()
      const repairAttempt: AutonomousRepairAttempt = {
        attempt,
        startedAt,
        completedAt: failedAt,
        failedValidation: failure,
        diagnosis: [errorMessage(error)],
      }
      const failed = {
        ...current,
        state: 'failed' as const,
        repairAttempts: [...current.repairAttempts, repairAttempt],
        error: errorMessage(error),
        updatedAt: failedAt,
        completedAt: failedAt,
      }
      await this.#store.save(failed)
      return failed
    }
  }
}

function validateId(value: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) throw new Error(`Invalid repair loop ID: ${value}`)
  return value
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
