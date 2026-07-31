import { promises as fs } from 'node:fs'
import path from 'node:path'

import { ensureSecureStateDirectory } from './secure-state-directory.js'
import type { EgressAuditRecord } from './egress-broker.js'

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export interface EgressAuditReadResult {
  readonly records: readonly EgressAuditRecord[]
  /** True only when the very last line was present but failed to parse -- the exact signature of a
   * process killed mid-`write()`, not a corrupt record anywhere else in the file. */
  readonly truncatedTailDropped: boolean
  readonly corruptLinesDropped: number
}

/**
 * Reads the append-only egress audit JSONL log, tolerating a torn trailing write from a process
 * that was killed mid-append. A missing file reads as empty, never an error. Any line -- not only
 * the last -- that isn't a well-formed `EgressAuditRecord` is dropped and counted rather than
 * aborting the whole read, so one bad record can't hide the rest of the durable evidence.
 */
export async function readEgressAuditRecords(filePath: string): Promise<EgressAuditReadResult> {
  let text: string
  try {
    text = await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if (isNotFound(error)) {
      return { records: [], truncatedTailDropped: false, corruptLinesDropped: 0 }
    }
    throw error
  }

  const lines = text.split('\n').filter((line) => line.length > 0)
  const records: EgressAuditRecord[] = []
  let corruptLinesDropped = 0
  let truncatedTailDropped = false

  lines.forEach((line, index) => {
    const record = parseAuditRecord(line)
    if (record !== undefined) {
      records.push(record)
      return
    }
    corruptLinesDropped += 1
    if (index === lines.length - 1) truncatedTailDropped = true
  })

  return { records, truncatedTailDropped, corruptLinesDropped }
}

export interface EgressAuditRotationResult {
  readonly rotated: boolean
  readonly recordsKept: number
  readonly recordsDroppedAsCorrupt: number
}

export interface EgressAuditRotationInput {
  readonly filePath: string
  /** Rotate once the live file reaches this size. */
  readonly maxBytes?: number
  /** Rotate once the live file's last modification is at least this old, regardless of size. */
  readonly maxAgeMs?: number
  readonly now?: () => Date
}

/**
 * Bounded, single-generation retention for the egress audit log: once the live file exceeds
 * `maxBytes` or `maxAgeMs`, its well-formed records (a torn trailing line is healed away, never
 * propagated) are archived to `<filePath>.1` -- replacing whatever that held before -- and the live
 * file is reset to empty so append-only writes keep succeeding. Refuses to operate through a
 * symlinked file or parent directory. A crash between archiving and resetting the live file is safe
 * to re-run: the next pass finds the same oversized file and simply repeats the rotation.
 */
export async function rotateEgressAuditLogIfNeeded(
  input: EgressAuditRotationInput,
): Promise<EgressAuditRotationResult> {
  const stat = await fs.lstat(input.filePath).catch(() => undefined)
  if (stat === undefined) return { rotated: false, recordsKept: 0, recordsDroppedAsCorrupt: 0 }
  if (!stat.isFile()) {
    throw new Error('Egress audit log path must be a regular file, not a symlink or directory.')
  }

  const now = input.now ?? (() => new Date())
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES
  const maxAgeMs = input.maxAgeMs ?? DEFAULT_MAX_AGE_MS
  const ageMs = now().getTime() - stat.mtime.getTime()
  if (stat.size < maxBytes && ageMs < maxAgeMs) {
    return { rotated: false, recordsKept: 0, recordsDroppedAsCorrupt: 0 }
  }

  await ensureSecureStateDirectory(path.dirname(input.filePath))
  const { records, corruptLinesDropped } = await readEgressAuditRecords(input.filePath)

  const archivePath = `${input.filePath}.1`
  const tempArchivePath = `${archivePath}.tmp-${process.pid}-${Date.now().toString(36)}`
  const body = records.map((record) => JSON.stringify(record)).join('\n')
  await fs.writeFile(tempArchivePath, body.length > 0 ? `${body}\n` : '', {
    encoding: 'utf8',
    mode: 0o600,
  })
  await fs.rename(tempArchivePath, archivePath)
  await fs.writeFile(input.filePath, '', { encoding: 'utf8', mode: 0o600, flag: 'w' })

  return {
    rotated: true,
    recordsKept: records.length,
    recordsDroppedAsCorrupt: corruptLinesDropped,
  }
}

function parseAuditRecord(line: string): EgressAuditRecord | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const record = parsed as Record<string, unknown>
  if (record['schemaVersion'] !== 1) return undefined
  if (typeof record['recordedAt'] !== 'string') return undefined
  if (typeof record['destinationHostname'] !== 'string') return undefined
  return record as unknown as EgressAuditRecord
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ENOENT'
  )
}
