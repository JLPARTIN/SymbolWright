import type { RuntimeAuditEvent } from './runtime-audit-log.js'

export const AUDIT_LEDGER_STORE_BLOCK_ID = 'AUDIT-LEDGER-01' as const

export const AUDIT_LEDGER_STORE_OUTCOMES = ['PERSISTED', 'REPLAYED', 'BLOCKED', 'EMPTY'] as const
export type AuditLedgerStoreOutcome = (typeof AUDIT_LEDGER_STORE_OUTCOMES)[number]

export const AUDIT_LEDGER_FINDING_CODES = [
  'LEDGER_PERSISTED',
  'LEDGER_REPLAYED',
  'LEDGER_EMPTY',
  'EVENTS_REDACTED',
  'INVALID_EVENT',
  'REPLAY_MISMATCH',
] as const
export type AuditLedgerFindingCode = (typeof AUDIT_LEDGER_FINDING_CODES)[number]

export const AUDIT_LEDGER_FINDING_SEVERITIES = ['INFO', 'WARN', 'ERROR'] as const
export type AuditLedgerFindingSeverity = (typeof AUDIT_LEDGER_FINDING_SEVERITIES)[number]

export interface AuditLedgerFinding {
  readonly code: AuditLedgerFindingCode
  readonly severity: AuditLedgerFindingSeverity
  readonly message: string
}

export interface AuditLedgerEntry {
  readonly sequenceNumber: number
  readonly timestamp: string
  readonly event: RuntimeAuditEvent
  readonly redacted: boolean
}

export interface AuditLedgerPersistResult {
  readonly blockId: typeof AUDIT_LEDGER_STORE_BLOCK_ID
  readonly outcome: AuditLedgerStoreOutcome
  readonly entriesWritten: number
  readonly entriesRedacted: number
  readonly findings: readonly AuditLedgerFinding[]
}

export interface AuditLedgerReplayResult {
  readonly blockId: typeof AUDIT_LEDGER_STORE_BLOCK_ID
  readonly outcome: AuditLedgerStoreOutcome
  readonly entriesRead: number
  readonly validEntries: number
  readonly invalidEntries: number
  readonly findings: readonly AuditLedgerFinding[]
  readonly entries: readonly AuditLedgerEntry[]
}

const REDACT_PATTERNS = [
  /ghp_[A-Za-z0-9_]+/g,
  /gho_[A-Za-z0-9_]+/g,
  /github_pat_[A-Za-z0-9_]+/g,
  /sk-[A-Za-z0-9_-]+/g,
  /Bearer\s+[A-Za-z0-9._-]+/g,
]

function redactDetail(detail: string): string {
  let result = detail
  for (const pattern of REDACT_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]')
  }
  return result
}

function redactEvent(event: RuntimeAuditEvent): {
  readonly event: RuntimeAuditEvent
  readonly wasRedacted: boolean
} {
  const redacted = redactDetail(event.detail)
  if (redacted === event.detail) {
    return { event, wasRedacted: false }
  }
  return {
    event: { ...event, detail: redacted },
    wasRedacted: true,
  }
}

function validateEvent(event: RuntimeAuditEvent): boolean {
  return (
    typeof event.action === 'string' &&
    event.action.trim().length > 0 &&
    (event.status === 'allowed' || event.status === 'blocked') &&
    typeof event.detail === 'string' &&
    event.detail.trim().length > 0
  )
}

export function persistAuditLedger(
  events: readonly RuntimeAuditEvent[],
  timestamp: string,
): AuditLedgerPersistResult {
  const findings: AuditLedgerFinding[] = []

  if (events.length === 0) {
    findings.push({
      code: 'LEDGER_EMPTY',
      severity: 'INFO',
      message: 'No audit events to persist.',
    })
    return {
      blockId: AUDIT_LEDGER_STORE_BLOCK_ID,
      outcome: 'EMPTY',
      entriesWritten: 0,
      entriesRedacted: 0,
      findings,
    }
  }

  let entriesRedacted = 0
  let invalidCount = 0

  for (const event of events) {
    if (!validateEvent(event)) {
      invalidCount++
      findings.push({
        code: 'INVALID_EVENT',
        severity: 'WARN',
        message: `Invalid audit event: action="${event.action}", status="${event.status}"`,
      })
      continue
    }

    const { wasRedacted } = redactEvent(event)
    if (wasRedacted) {
      entriesRedacted++
    }
  }

  if (entriesRedacted > 0) {
    findings.push({
      code: 'EVENTS_REDACTED',
      severity: 'INFO',
      message: `${entriesRedacted} event(s) had sensitive content redacted before persistence.`,
    })
  }

  const validEntries = events.length - invalidCount

  findings.push({
    code: 'LEDGER_PERSISTED',
    severity: 'INFO',
    message: `Persisted ${validEntries} audit event(s) at ${timestamp}.`,
  })

  return {
    blockId: AUDIT_LEDGER_STORE_BLOCK_ID,
    outcome: 'PERSISTED',
    entriesWritten: validEntries,
    entriesRedacted,
    findings,
  }
}

export function replayAuditLedger(jsonlLines: readonly string[]): AuditLedgerReplayResult {
  const findings: AuditLedgerFinding[] = []
  const entries: AuditLedgerEntry[] = []
  let invalidEntries = 0

  if (jsonlLines.length === 0) {
    findings.push({
      code: 'LEDGER_EMPTY',
      severity: 'INFO',
      message: 'No ledger entries to replay.',
    })
    return {
      blockId: AUDIT_LEDGER_STORE_BLOCK_ID,
      outcome: 'EMPTY',
      entriesRead: 0,
      validEntries: 0,
      invalidEntries: 0,
      findings,
      entries: [],
    }
  }

  for (const line of jsonlLines) {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      continue
    }

    try {
      const parsed = JSON.parse(trimmed) as AuditLedgerEntry
      if (
        typeof parsed.sequenceNumber !== 'number' ||
        typeof parsed.timestamp !== 'string' ||
        parsed.event === undefined ||
        !validateEvent(parsed.event)
      ) {
        invalidEntries++
        findings.push({
          code: 'REPLAY_MISMATCH',
          severity: 'WARN',
          message: `Invalid ledger entry at sequence ${String(parsed.sequenceNumber ?? '?')}.`,
        })
        continue
      }
      entries.push(parsed)
    } catch {
      invalidEntries++
      findings.push({
        code: 'REPLAY_MISMATCH',
        severity: 'ERROR',
        message: 'Failed to parse JSONL line as audit ledger entry.',
      })
    }
  }

  findings.push({
    code: 'LEDGER_REPLAYED',
    severity: 'INFO',
    message: `Replayed ${entries.length} valid entry(ies) from ${jsonlLines.length} line(s).`,
  })

  return {
    blockId: AUDIT_LEDGER_STORE_BLOCK_ID,
    outcome: invalidEntries > 0 ? 'BLOCKED' : 'REPLAYED',
    entriesRead: jsonlLines.length,
    validEntries: entries.length,
    invalidEntries,
    findings,
    entries,
  }
}

export function serializeAuditLedger(
  events: readonly RuntimeAuditEvent[],
  timestamp: string,
): readonly string[] {
  const lines: string[] = []
  let seq = 1

  for (const event of events) {
    if (!validateEvent(event)) {
      continue
    }

    const { event: redacted, wasRedacted } = redactEvent(event)
    const entry: AuditLedgerEntry = {
      sequenceNumber: seq++,
      timestamp,
      event: redacted,
      redacted: wasRedacted,
    }
    lines.push(JSON.stringify(entry))
  }

  return lines
}

export function renderAuditLedgerPersistResult(result: AuditLedgerPersistResult): string {
  const lines = [
    'CodeMind Audit Ledger',
    '',
    `Block: ${result.blockId}`,
    `Outcome: ${result.outcome}`,
    `Entries written: ${result.entriesWritten}`,
    `Entries redacted: ${result.entriesRedacted}`,
  ]

  if (result.findings.length > 0) {
    lines.push('', 'Findings:')
    for (const finding of result.findings) {
      lines.push(`- [${finding.severity}] ${finding.code}: ${finding.message}`)
    }
  }

  return lines.join('\n')
}

export function renderAuditLedgerReplayResult(result: AuditLedgerReplayResult): string {
  const lines = [
    'CodeMind Audit Ledger Replay',
    '',
    `Block: ${result.blockId}`,
    `Outcome: ${result.outcome}`,
    `Entries read: ${result.entriesRead}`,
    `Valid entries: ${result.validEntries}`,
    `Invalid entries: ${result.invalidEntries}`,
  ]

  if (result.entries.length > 0) {
    lines.push('', 'Replayed events:')
    for (const entry of result.entries) {
      lines.push(
        `- [${entry.sequenceNumber}] ${entry.event.status.toUpperCase()} ${entry.event.action}: ${entry.event.detail}`,
      )
    }
  }

  if (result.findings.length > 0) {
    lines.push('', 'Findings:')
    for (const finding of result.findings) {
      lines.push(`- [${finding.severity}] ${finding.code}: ${finding.message}`)
    }
  }

  return lines.join('\n')
}
