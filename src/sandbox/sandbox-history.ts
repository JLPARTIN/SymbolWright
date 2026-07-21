import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { redactSandboxText } from './sandbox-redaction.js'
import type { SandboxExecutionResult } from './sandbox-types.js'

export interface SandboxExecutionSummary {
  readonly executionId: string
  readonly languageId: string
  readonly runnerId: string
  readonly status: SandboxExecutionResult['status']
  readonly trustClass: SandboxExecutionResult['trustClass']
  readonly backend: SandboxExecutionResult['backend']
  readonly startedAt: string
  readonly completedAt: string
  readonly durationMs: number
  readonly missionId?: string
}

export interface SandboxExecutionRecord {
  readonly schemaVersion: 1
  readonly executionId: string
  readonly createdAt: string
  readonly result: SandboxExecutionResult
  readonly missionId?: string
}

export interface SandboxHistoryList {
  readonly schemaVersion: 1
  readonly executions: readonly SandboxExecutionSummary[]
  readonly warnings: readonly string[]
}

export interface SandboxHistoryStoreOptions {
  readonly workspaceRoot: string
  readonly now?: () => Date
  readonly env?: NodeJS.ProcessEnv
}

const INDEX_FILE = 'index.json'
const EXECUTIONS_DIR = 'executions'
const EXECUTION_ID_PATTERN = /^[A-Za-z0-9._:-]+$/

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

function atomicWriteJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath))
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  renameSync(tmp, filePath)
}

function safeExecutionId(executionId: string): string {
  if (!EXECUTION_ID_PATTERN.test(executionId) || executionId.includes('..')) {
    throw new Error('Invalid sandbox execution id')
  }
  return executionId
}

function sanitizeResult(result: SandboxExecutionResult): SandboxExecutionResult {
  const stdout = redactSandboxText(result.stdout, 64_000)
  const stderr = redactSandboxText(result.stderr, 64_000)
  const outputExcerpt =
    result.evidence.outputExcerpt === undefined
      ? undefined
      : redactSandboxText(result.evidence.outputExcerpt, 4_000)
  return {
    ...result,
    stdout,
    stderr,
    evidence: {
      ...result.evidence,
      ...(outputExcerpt === undefined ? {} : { outputExcerpt }),
    },
  }
}

function summarize(record: SandboxExecutionRecord): SandboxExecutionSummary {
  return {
    executionId: record.executionId,
    languageId: record.result.languageId,
    runnerId: record.result.runnerId,
    status: record.result.status,
    trustClass: record.result.trustClass,
    backend: record.result.backend,
    startedAt: record.result.startedAt,
    completedAt: record.result.completedAt,
    durationMs: record.result.durationMs,
    ...(record.missionId === undefined ? {} : { missionId: record.missionId }),
  }
}

export class SandboxHistoryStore {
  private readonly root: string
  private readonly executionsRoot: string
  private readonly indexPath: string
  private readonly now: () => Date

  public constructor(options: SandboxHistoryStoreOptions) {
    this.root = path.join(path.resolve(options.workspaceRoot), '.codemind', 'sandbox')
    this.executionsRoot = path.join(this.root, EXECUTIONS_DIR)
    this.indexPath = path.join(this.root, INDEX_FILE)
    this.now = options.now ?? (() => new Date())
  }

  public record(result: SandboxExecutionResult, missionId?: string): SandboxExecutionRecord {
    const executionId = safeExecutionId(result.executionId)
    const record: SandboxExecutionRecord = {
      schemaVersion: 1,
      executionId,
      createdAt: this.now().toISOString(),
      result: sanitizeResult(result),
      ...(missionId === undefined ? {} : { missionId }),
    }
    atomicWriteJson(this.executionPath(executionId), record)
    this.writeIndex([summarize(record), ...this.readIndex().executions])
    return record
  }

  public read(executionId: string): SandboxExecutionRecord | undefined {
    const filePath = this.executionPath(safeExecutionId(executionId))
    if (!existsSync(filePath)) return undefined
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as SandboxExecutionRecord
      if (parsed.schemaVersion !== 1 || parsed.executionId !== executionId) return undefined
      return parsed
    } catch {
      return undefined
    }
  }

  public list(limit = 50): SandboxHistoryList {
    const index = this.readIndex()
    return {
      schemaVersion: 1,
      executions: index.executions.slice(0, Math.min(200, Math.max(1, limit))),
      warnings: index.warnings,
    }
  }

  public cleanup(): void {
    if (existsSync(this.root)) rmSync(this.root, { recursive: true, force: true })
  }

  private executionPath(executionId: string): string {
    const filePath = path.join(this.executionsRoot, `${executionId}.json`)
    if (!filePath.startsWith(`${this.executionsRoot}${path.sep}`)) {
      throw new Error('Sandbox execution path escaped history root')
    }
    return filePath
  }

  private readIndex(): SandboxHistoryList {
    if (!existsSync(this.indexPath)) return { schemaVersion: 1, executions: [], warnings: [] }
    try {
      const parsed = JSON.parse(readFileSync(this.indexPath, 'utf8')) as SandboxHistoryList
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.executions)) {
        return {
          schemaVersion: 1,
          executions: [],
          warnings: ['Sandbox history index was malformed.'],
        }
      }
      return { schemaVersion: 1, executions: parsed.executions, warnings: parsed.warnings ?? [] }
    } catch {
      return {
        schemaVersion: 1,
        executions: [],
        warnings: ['Sandbox history index was unreadable.'],
      }
    }
  }

  private writeIndex(executions: readonly SandboxExecutionSummary[]): void {
    atomicWriteJson(this.indexPath, {
      schemaVersion: 1,
      executions: executions.slice(0, 200),
      warnings: [],
    })
  }
}
