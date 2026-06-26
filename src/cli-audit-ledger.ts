import fs from 'node:fs'

import type { RuntimeAuditEvent } from './runtime/audit/runtime-audit-log.js'
import {
  persistAuditLedger,
  replayAuditLedger,
  renderAuditLedgerPersistResult,
  renderAuditLedgerReplayResult,
  serializeAuditLedger,
} from './runtime/audit/audit-ledger-store.js'

interface AuditLedgerFixture {
  readonly mode: 'persist' | 'replay'
  readonly events?: readonly RuntimeAuditEvent[]
  readonly jsonlLines?: readonly string[]
  readonly timestamp?: string
}

export function renderAuditLedgerCommand(fixturePath: string): string {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as AuditLedgerFixture

  if (raw.mode !== 'persist' && raw.mode !== 'replay') {
    throw new Error('Fixture must include a "mode" field set to "persist" or "replay".')
  }

  if (raw.mode === 'persist') {
    if (!Array.isArray(raw.events)) {
      throw new Error('Fixture in persist mode must include an "events" array.')
    }
    const timestamp = raw.timestamp ?? new Date().toISOString()
    const result = persistAuditLedger(raw.events, timestamp)
    const serialized = serializeAuditLedger(raw.events, timestamp)
    const lines = [renderAuditLedgerPersistResult(result)]
    if (serialized.length > 0) {
      lines.push('', 'Serialized JSONL:', ...serialized)
    }
    return lines.join('\n')
  }

  const jsonlLines = raw.jsonlLines ?? []
  const result = replayAuditLedger(jsonlLines)
  return renderAuditLedgerReplayResult(result)
}
