import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'

import type { MemoryDatabase } from './storage/database.js'

const DEFAULT_LEGACY_PATH = resolve(process.cwd(), '.codemind/ci-failure-ledger.json')

export interface LegacyFailureRecord {
  readonly failureClass: string
  readonly rootCause: string
  readonly preventionRule: string
  readonly regressionTest: string
  readonly firstSeen: string
}

interface LegacyFailureLedger {
  readonly failures: readonly LegacyFailureRecord[]
}

export type LegacyLedgerMigrationResult =
  | { readonly status: 'skipped'; readonly reason: 'missing' | 'parse_error' | 'invalid_shape' }
  | { readonly status: 'migrated'; readonly migratedCount: number }
  | { readonly status: 'empty'; readonly migratedCount: 0 }

export function migrateLegacyLedger(
  db: MemoryDatabase,
  legacyPath: string = DEFAULT_LEGACY_PATH,
): LegacyLedgerMigrationResult {
  if (!existsSync(legacyPath)) {
    return { status: 'skipped', reason: 'missing' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(legacyPath, 'utf-8')) as unknown
  } catch {
    return { status: 'skipped', reason: 'parse_error' }
  }

  if (!isLegacyFailureLedger(parsed)) {
    return { status: 'skipped', reason: 'invalid_shape' }
  }

  if (parsed.failures.length === 0) {
    unlinkSync(legacyPath)
    return { status: 'empty', migratedCount: 0 }
  }

  const dbInstance = db.getDb()
  const insertStmt = dbInstance.prepare(
    `
      INSERT OR IGNORE INTO episodic_interactions
        (id, timestamp, type, content, relevance_score, last_accessed)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
  )
  const now = Date.now()

  dbInstance.exec('BEGIN')
  try {
    for (const failure of parsed.failures) {
      const id = `legacy-${failure.failureClass}-${failure.firstSeen}`
      const content = JSON.stringify({
        failureClass: failure.failureClass,
        rootCause: failure.rootCause,
        preventionRule: failure.preventionRule,
        regressionTest: failure.regressionTest,
      })
      insertStmt.run(id, now, 'mistake_resolution', content, 1.0, now)
    }
    dbInstance.exec('COMMIT')
  } catch (error) {
    dbInstance.exec('ROLLBACK')
    throw error
  }

  unlinkSync(legacyPath)
  return { status: 'migrated', migratedCount: parsed.failures.length }
}

function isLegacyFailureLedger(value: unknown): value is LegacyFailureLedger {
  if (!isObject(value)) return false

  const failures = value['failures']
  return Array.isArray(failures) && failures.every((failure) => isLegacyFailureRecord(failure))
}

function isLegacyFailureRecord(value: unknown): value is LegacyFailureRecord {
  if (!isObject(value)) return false

  return (
    typeof value['failureClass'] === 'string' &&
    typeof value['rootCause'] === 'string' &&
    typeof value['preventionRule'] === 'string' &&
    typeof value['regressionTest'] === 'string' &&
    typeof value['firstSeen'] === 'string'
  )
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
