import fs from 'node:fs'

import type { AgentKernelTraceFrame } from './kernel/agent-kernel-trace.types.js'
import {
  persistTraceFrames,
  replayTraceFrames,
  renderTraceStorePersistResult,
  renderTraceStoreReplayResult,
  serializeTraceFrames,
} from './runtime/audit/trace-store.js'

interface TraceStoreFixture {
  readonly mode: 'persist' | 'replay'
  readonly frames?: readonly AgentKernelTraceFrame[]
  readonly jsonlLines?: readonly string[]
  readonly executionId?: string
  readonly storedAt?: string
}

export function renderTraceStoreCommand(fixturePath: string): string {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as TraceStoreFixture

  if (raw.mode !== 'persist' && raw.mode !== 'replay') {
    throw new Error('Fixture must include a "mode" field set to "persist" or "replay".')
  }

  if (raw.mode === 'persist') {
    if (!Array.isArray(raw.frames)) {
      throw new Error('Fixture in persist mode must include a "frames" array.')
    }
    const storedAt = raw.storedAt ?? new Date().toISOString()
    const result = persistTraceFrames(raw.frames, storedAt)
    const serialized = serializeTraceFrames(raw.frames, storedAt)
    const lines = [renderTraceStorePersistResult(result)]
    if (serialized.length > 0) {
      lines.push('', 'Serialized JSONL:', ...serialized)
    }
    return lines.join('\n')
  }

  const executionId = raw.executionId ?? 'unknown'
  const jsonlLines = raw.jsonlLines ?? []
  const result = replayTraceFrames(jsonlLines, executionId)
  return renderTraceStoreReplayResult(result)
}
