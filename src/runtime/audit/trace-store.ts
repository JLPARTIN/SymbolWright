import type { AgentKernelTraceFrame } from '../../kernel/agent-kernel-trace.types.js'

export const TRACE_STORE_BLOCK_ID = 'TRACE-STORE-01' as const

export const TRACE_STORE_OUTCOMES = ['STORED', 'REPLAYED', 'BLOCKED', 'EMPTY'] as const
export type TraceStoreOutcome = (typeof TRACE_STORE_OUTCOMES)[number]

export const TRACE_STORE_FINDING_CODES = [
  'FRAMES_STORED',
  'FRAMES_REPLAYED',
  'STORE_EMPTY',
  'INVALID_FRAME',
  'LINEAGE_GAP',
  'INVARIANT_VIOLATION',
] as const
export type TraceStoreFindingCode = (typeof TRACE_STORE_FINDING_CODES)[number]

export const TRACE_STORE_FINDING_SEVERITIES = ['INFO', 'WARN', 'ERROR'] as const
export type TraceStoreFindingSeverity = (typeof TRACE_STORE_FINDING_SEVERITIES)[number]

export interface TraceStoreFinding {
  readonly code: TraceStoreFindingCode
  readonly severity: TraceStoreFindingSeverity
  readonly message: string
}

export interface TraceStoreEntry {
  readonly sequenceNumber: number
  readonly storedAt: string
  readonly frame: AgentKernelTraceFrame
}

export interface TraceStorePersistResult {
  readonly blockId: typeof TRACE_STORE_BLOCK_ID
  readonly outcome: TraceStoreOutcome
  readonly framesStored: number
  readonly findings: readonly TraceStoreFinding[]
}

export interface TraceStoreReplayResult {
  readonly blockId: typeof TRACE_STORE_BLOCK_ID
  readonly outcome: TraceStoreOutcome
  readonly executionId: string
  readonly framesRead: number
  readonly validFrames: number
  readonly invalidFrames: number
  readonly lineageValid: boolean
  readonly invariantsValid: boolean
  readonly findings: readonly TraceStoreFinding[]
  readonly entries: readonly TraceStoreEntry[]
}

const EXPECTED_BLOCK_ORDER = [
  'AGENT-KERNEL-01',
  'AGENT-KERNEL-02',
  'AGENT-KERNEL-03',
  'AGENT-KERNEL-04',
  'AGENT-KERNEL-05',
  'AGENT-KERNEL-06',
] as const

function validateFrame(frame: AgentKernelTraceFrame): boolean {
  return (
    typeof frame.blockId === 'string' &&
    frame.blockId.trim().length > 0 &&
    typeof frame.executionId === 'string' &&
    frame.executionId.trim().length > 0 &&
    typeof frame.timestamp === 'string' &&
    frame.timestamp.trim().length > 0 &&
    frame.payloadSummary !== undefined &&
    frame.invariants !== undefined
  )
}

function checkLineage(frames: readonly AgentKernelTraceFrame[]): readonly string[] {
  const errors: string[] = []
  const blockIds = frames.map((f) => f.blockId)

  for (let i = 1; i < blockIds.length; i++) {
    const prev = EXPECTED_BLOCK_ORDER.indexOf(blockIds[i - 1] as typeof EXPECTED_BLOCK_ORDER[number])
    const curr = EXPECTED_BLOCK_ORDER.indexOf(blockIds[i] as typeof EXPECTED_BLOCK_ORDER[number])

    if (prev === -1 || curr === -1) {
      continue
    }

    if (curr <= prev) {
      errors.push(`Lineage gap: ${blockIds[i - 1]} → ${blockIds[i]} is out of expected order.`)
    }
  }

  return errors
}

function checkInvariants(frames: readonly AgentKernelTraceFrame[]): readonly string[] {
  const violations: string[] = []

  for (const frame of frames) {
    if (frame.invariants.providerInvoked) {
      violations.push(`${frame.blockId}: providerInvoked must be false.`)
    }
    if (frame.invariants.repoMutationAllowed) {
      violations.push(`${frame.blockId}: repoMutationAllowed must be false.`)
    }
    if (frame.invariants.commandExecutionAllowed) {
      violations.push(`${frame.blockId}: commandExecutionAllowed must be false.`)
    }
  }

  return violations
}

export function persistTraceFrames(
  frames: readonly AgentKernelTraceFrame[],
  storedAt: string,
): TraceStorePersistResult {
  const findings: TraceStoreFinding[] = []

  if (frames.length === 0) {
    findings.push({
      code: 'STORE_EMPTY',
      severity: 'INFO',
      message: 'No trace frames to store.',
    })
    return {
      blockId: TRACE_STORE_BLOCK_ID,
      outcome: 'EMPTY',
      framesStored: 0,
      findings,
    }
  }

  let invalidCount = 0
  for (const frame of frames) {
    if (!validateFrame(frame)) {
      invalidCount++
      findings.push({
        code: 'INVALID_FRAME',
        severity: 'WARN',
        message: `Invalid trace frame: blockId="${frame.blockId}"`,
      })
    }
  }

  const stored = frames.length - invalidCount
  findings.push({
    code: 'FRAMES_STORED',
    severity: 'INFO',
    message: `Stored ${stored} trace frame(s) at ${storedAt}.`,
  })

  return {
    blockId: TRACE_STORE_BLOCK_ID,
    outcome: invalidCount > 0 ? 'BLOCKED' : 'STORED',
    framesStored: stored,
    findings,
  }
}

export function replayTraceFrames(
  jsonlLines: readonly string[],
  executionId: string,
): TraceStoreReplayResult {
  const findings: TraceStoreFinding[] = []
  const entries: TraceStoreEntry[] = []
  let invalidFrames = 0

  if (jsonlLines.length === 0) {
    findings.push({
      code: 'STORE_EMPTY',
      severity: 'INFO',
      message: 'No trace entries to replay.',
    })
    return {
      blockId: TRACE_STORE_BLOCK_ID,
      outcome: 'EMPTY',
      executionId,
      framesRead: 0,
      validFrames: 0,
      invalidFrames: 0,
      lineageValid: true,
      invariantsValid: true,
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
      const parsed = JSON.parse(trimmed) as TraceStoreEntry
      if (
        typeof parsed.sequenceNumber !== 'number' ||
        parsed.frame === undefined ||
        !validateFrame(parsed.frame)
      ) {
        invalidFrames++
        findings.push({
          code: 'INVALID_FRAME',
          severity: 'WARN',
          message: `Invalid trace store entry at sequence ${String(parsed.sequenceNumber ?? '?')}.`,
        })
        continue
      }

      if (parsed.frame.executionId === executionId) {
        entries.push(parsed)
      }
    } catch {
      invalidFrames++
      findings.push({
        code: 'INVALID_FRAME',
        severity: 'ERROR',
        message: 'Failed to parse JSONL line as trace store entry.',
      })
    }
  }

  const frames = entries.map((e) => e.frame)
  const lineageErrors = checkLineage(frames)
  const invariantViolations = checkInvariants(frames)

  for (const err of lineageErrors) {
    findings.push({ code: 'LINEAGE_GAP', severity: 'ERROR', message: err })
  }

  for (const violation of invariantViolations) {
    findings.push({ code: 'INVARIANT_VIOLATION', severity: 'ERROR', message: violation })
  }

  findings.push({
    code: 'FRAMES_REPLAYED',
    severity: 'INFO',
    message: `Replayed ${entries.length} frame(s) for execution ${executionId}.`,
  })

  const hasErrors = lineageErrors.length > 0 || invariantViolations.length > 0 || invalidFrames > 0

  return {
    blockId: TRACE_STORE_BLOCK_ID,
    outcome: hasErrors ? 'BLOCKED' : 'REPLAYED',
    executionId,
    framesRead: jsonlLines.length,
    validFrames: entries.length,
    invalidFrames,
    lineageValid: lineageErrors.length === 0,
    invariantsValid: invariantViolations.length === 0,
    findings,
    entries,
  }
}

export function serializeTraceFrames(
  frames: readonly AgentKernelTraceFrame[],
  storedAt: string,
): readonly string[] {
  const lines: string[] = []
  let seq = 1

  for (const frame of frames) {
    if (!validateFrame(frame)) {
      continue
    }

    const entry: TraceStoreEntry = {
      sequenceNumber: seq++,
      storedAt,
      frame,
    }
    lines.push(JSON.stringify(entry))
  }

  return lines
}

export function renderTraceStorePersistResult(result: TraceStorePersistResult): string {
  const lines = [
    'CodeMind Trace Store',
    '',
    `Block: ${result.blockId}`,
    `Outcome: ${result.outcome}`,
    `Frames stored: ${result.framesStored}`,
  ]

  if (result.findings.length > 0) {
    lines.push('', 'Findings:')
    for (const finding of result.findings) {
      lines.push(`- [${finding.severity}] ${finding.code}: ${finding.message}`)
    }
  }

  return lines.join('\n')
}

export function renderTraceStoreReplayResult(result: TraceStoreReplayResult): string {
  const lines = [
    'CodeMind Trace Store Replay',
    '',
    `Block: ${result.blockId}`,
    `Outcome: ${result.outcome}`,
    `Execution ID: ${result.executionId}`,
    `Frames read: ${result.framesRead}`,
    `Valid frames: ${result.validFrames}`,
    `Invalid frames: ${result.invalidFrames}`,
    `Lineage valid: ${result.lineageValid ? 'yes' : 'no'}`,
    `Invariants valid: ${result.invariantsValid ? 'yes' : 'no'}`,
  ]

  if (result.entries.length > 0) {
    lines.push('', 'Replayed frames:')
    for (const entry of result.entries) {
      lines.push(`- [${entry.sequenceNumber}] ${entry.frame.blockId} (${entry.frame.payloadSummary.kind})`)
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
