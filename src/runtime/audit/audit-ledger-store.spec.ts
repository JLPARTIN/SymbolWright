import { describe, expect, it } from 'vitest'

import type { RuntimeAuditEvent } from './runtime-audit-log.js'
import {
  persistAuditLedger,
  replayAuditLedger,
  renderAuditLedgerPersistResult,
  renderAuditLedgerReplayResult,
  serializeAuditLedger,
} from './audit-ledger-store.js'

const baseEvent: RuntimeAuditEvent = {
  action: 'local_file_write',
  status: 'allowed',
  detail: 'Wrote src/foo.ts per operator approval.',
  timestamp: '2026-06-26T00:00:00.000Z',
}

const blockedEvent: RuntimeAuditEvent = {
  action: 'github_write_gate',
  status: 'blocked',
  detail: 'GitHub writes disabled by policy.',
  timestamp: '2026-06-26T00:00:01.000Z',
}

const sensitiveEvent: RuntimeAuditEvent = {
  action: 'github_live_read',
  status: 'allowed',
  detail: 'Read PR with token ghp_abc123secret and Bearer eyJhbGci.token.sig',
  timestamp: '2026-06-26T00:00:02.000Z',
}

describe('persistAuditLedger', () => {
  it('persists valid events', () => {
    const result = persistAuditLedger([baseEvent, blockedEvent], '2026-06-26T00:00:00Z')

    expect(result.outcome).toBe('PERSISTED')
    expect(result.entriesWritten).toBe(2)
    expect(result.entriesRedacted).toBe(0)
    expect(result.findings.some((f) => f.code === 'LEDGER_PERSISTED')).toBe(true)
  })

  it('returns EMPTY when no events', () => {
    const result = persistAuditLedger([], '2026-06-26T00:00:00Z')

    expect(result.outcome).toBe('EMPTY')
    expect(result.entriesWritten).toBe(0)
    expect(result.findings.some((f) => f.code === 'LEDGER_EMPTY')).toBe(true)
  })

  it('counts redacted events', () => {
    const result = persistAuditLedger([sensitiveEvent], '2026-06-26T00:00:00Z')

    expect(result.outcome).toBe('PERSISTED')
    expect(result.entriesRedacted).toBe(1)
    expect(result.findings.some((f) => f.code === 'EVENTS_REDACTED')).toBe(true)
  })

  it('warns on invalid events', () => {
    const invalid: RuntimeAuditEvent = { action: '', status: 'allowed', detail: 'bad', timestamp: '2026-06-26T00:00:00.000Z' }
    const result = persistAuditLedger([baseEvent, invalid], '2026-06-26T00:00:00Z')

    expect(result.entriesWritten).toBe(1)
    expect(result.findings.some((f) => f.code === 'INVALID_EVENT')).toBe(true)
  })
})

describe('serializeAuditLedger', () => {
  it('serializes events to JSONL', () => {
    const lines = serializeAuditLedger([baseEvent, blockedEvent], '2026-06-26T00:00:00Z')

    expect(lines).toHaveLength(2)
    const first = JSON.parse(lines[0] as string)
    expect(first.sequenceNumber).toBe(1)
    expect(first.event.action).toBe('local_file_write')
    expect(first.redacted).toBe(false)
  })

  it('redacts sensitive content in serialized output', () => {
    const lines = serializeAuditLedger([sensitiveEvent], '2026-06-26T00:00:00Z')

    expect(lines).toHaveLength(1)
    const entry = JSON.parse(lines[0] as string)
    expect(entry.event.detail).toContain('[REDACTED]')
    expect(entry.event.detail).not.toContain('ghp_abc123secret')
    expect(entry.redacted).toBe(true)
  })

  it('skips invalid events', () => {
    const invalid: RuntimeAuditEvent = { action: '', status: 'allowed', detail: 'bad', timestamp: '2026-06-26T00:00:00.000Z' }
    const lines = serializeAuditLedger([baseEvent, invalid], '2026-06-26T00:00:00Z')

    expect(lines).toHaveLength(1)
  })
})

describe('replayAuditLedger', () => {
  it('replays valid JSONL entries', () => {
    const lines = serializeAuditLedger([baseEvent, blockedEvent], '2026-06-26T00:00:00Z')
    const result = replayAuditLedger(lines)

    expect(result.outcome).toBe('REPLAYED')
    expect(result.validEntries).toBe(2)
    expect(result.invalidEntries).toBe(0)
    expect(result.entries).toHaveLength(2)
  })

  it('returns EMPTY for empty input', () => {
    const result = replayAuditLedger([])

    expect(result.outcome).toBe('EMPTY')
    expect(result.validEntries).toBe(0)
  })

  it('reports invalid JSONL lines', () => {
    const result = replayAuditLedger(['not valid json', '{"bad": true}'])

    expect(result.outcome).toBe('BLOCKED')
    expect(result.invalidEntries).toBe(2)
    expect(result.findings.some((f) => f.code === 'REPLAY_MISMATCH')).toBe(true)
  })

  it('skips blank lines', () => {
    const lines = serializeAuditLedger([baseEvent], '2026-06-26T00:00:00Z')
    const result = replayAuditLedger(['', ...lines, '  '])

    expect(result.validEntries).toBe(1)
  })
})

describe('renderAuditLedgerPersistResult', () => {
  it('renders persist result', () => {
    const result = persistAuditLedger([baseEvent], '2026-06-26T00:00:00Z')
    const output = renderAuditLedgerPersistResult(result)

    expect(output).toContain('CodeMind Audit Ledger')
    expect(output).toContain('Outcome: PERSISTED')
    expect(output).toContain('Entries written: 1')
  })
})

describe('renderAuditLedgerReplayResult', () => {
  it('renders replay result', () => {
    const lines = serializeAuditLedger([baseEvent], '2026-06-26T00:00:00Z')
    const result = replayAuditLedger(lines)
    const output = renderAuditLedgerReplayResult(result)

    expect(output).toContain('CodeMind Audit Ledger Replay')
    expect(output).toContain('Outcome: REPLAYED')
    expect(output).toContain('Valid entries: 1')
  })
})
