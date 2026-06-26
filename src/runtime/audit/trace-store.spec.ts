import { describe, expect, it } from 'vitest'

import type { AgentKernelTraceFrame } from '../../kernel/agent-kernel-trace.types.js'
import {
  persistTraceFrames,
  replayTraceFrames,
  renderTraceStorePersistResult,
  renderTraceStoreReplayResult,
  serializeTraceFrames,
} from './trace-store.js'

function makeFrame(blockId: string, executionId: string = 'exec-1'): AgentKernelTraceFrame {
  return {
    blockId: blockId as AgentKernelTraceFrame['blockId'],
    prId: `PR-AK-${blockId.split('-')[2]}`,
    phaseId: `Phase-16G-AK-${blockId.split('-')[2]}`,
    executionId,
    timestamp: '2026-06-26T00:00:00Z',
    payloadSummary: { kind: 'PLANNING', providerReady: true },
    invariants: {
      providerInvoked: false,
      repoMutationAllowed: false,
      commandExecutionAllowed: false,
    },
    warnings: [],
  }
}

const validFrames: readonly AgentKernelTraceFrame[] = [
  makeFrame('AGENT-KERNEL-01'),
  makeFrame('AGENT-KERNEL-02'),
  makeFrame('AGENT-KERNEL-03'),
  makeFrame('AGENT-KERNEL-04'),
]

describe('persistTraceFrames', () => {
  it('stores valid frames', () => {
    const result = persistTraceFrames(validFrames, '2026-06-26T00:00:00Z')

    expect(result.outcome).toBe('STORED')
    expect(result.framesStored).toBe(4)
    expect(result.findings.some((f) => f.code === 'FRAMES_STORED')).toBe(true)
  })

  it('returns EMPTY for no frames', () => {
    const result = persistTraceFrames([], '2026-06-26T00:00:00Z')

    expect(result.outcome).toBe('EMPTY')
    expect(result.framesStored).toBe(0)
  })

  it('warns on invalid frames', () => {
    const invalid = { ...makeFrame('AGENT-KERNEL-01'), blockId: '' } as unknown as AgentKernelTraceFrame
    const result = persistTraceFrames([makeFrame('AGENT-KERNEL-01'), invalid], '2026-06-26T00:00:00Z')

    expect(result.outcome).toBe('BLOCKED')
    expect(result.framesStored).toBe(1)
    expect(result.findings.some((f) => f.code === 'INVALID_FRAME')).toBe(true)
  })
})

describe('serializeTraceFrames', () => {
  it('serializes frames to JSONL', () => {
    const lines = serializeTraceFrames(validFrames, '2026-06-26T00:00:00Z')

    expect(lines).toHaveLength(4)
    const first = JSON.parse(lines[0] as string)
    expect(first.sequenceNumber).toBe(1)
    expect(first.frame.blockId).toBe('AGENT-KERNEL-01')
  })
})

describe('replayTraceFrames', () => {
  it('replays valid frames for matching execution ID', () => {
    const lines = serializeTraceFrames(validFrames, '2026-06-26T00:00:00Z')
    const result = replayTraceFrames(lines, 'exec-1')

    expect(result.outcome).toBe('REPLAYED')
    expect(result.validFrames).toBe(4)
    expect(result.invalidFrames).toBe(0)
    expect(result.lineageValid).toBe(true)
    expect(result.invariantsValid).toBe(true)
  })

  it('filters by execution ID', () => {
    const mixed = [makeFrame('AGENT-KERNEL-01', 'exec-1'), makeFrame('AGENT-KERNEL-02', 'exec-2')]
    const lines = serializeTraceFrames(mixed, '2026-06-26T00:00:00Z')
    const result = replayTraceFrames(lines, 'exec-1')

    expect(result.validFrames).toBe(1)
    expect(result.entries[0]?.frame.blockId).toBe('AGENT-KERNEL-01')
  })

  it('returns EMPTY for empty input', () => {
    const result = replayTraceFrames([], 'exec-1')

    expect(result.outcome).toBe('EMPTY')
    expect(result.validFrames).toBe(0)
  })

  it('detects lineage gaps', () => {
    const outOfOrder = [makeFrame('AGENT-KERNEL-03'), makeFrame('AGENT-KERNEL-01')]
    const lines = serializeTraceFrames(outOfOrder, '2026-06-26T00:00:00Z')
    const result = replayTraceFrames(lines, 'exec-1')

    expect(result.outcome).toBe('BLOCKED')
    expect(result.lineageValid).toBe(false)
    expect(result.findings.some((f) => f.code === 'LINEAGE_GAP')).toBe(true)
  })

  it('detects invariant violations', () => {
    const violating: AgentKernelTraceFrame = {
      ...makeFrame('AGENT-KERNEL-01'),
      invariants: { providerInvoked: true, repoMutationAllowed: false, commandExecutionAllowed: false },
    }
    const lines = serializeTraceFrames([violating], '2026-06-26T00:00:00Z')
    const result = replayTraceFrames(lines, 'exec-1')

    expect(result.outcome).toBe('BLOCKED')
    expect(result.invariantsValid).toBe(false)
    expect(result.findings.some((f) => f.code === 'INVARIANT_VIOLATION')).toBe(true)
  })

  it('reports invalid JSONL lines', () => {
    const result = replayTraceFrames(['not json'], 'exec-1')

    expect(result.outcome).toBe('BLOCKED')
    expect(result.invalidFrames).toBe(1)
  })
})

describe('renderTraceStorePersistResult', () => {
  it('renders persist result', () => {
    const result = persistTraceFrames(validFrames, '2026-06-26T00:00:00Z')
    const output = renderTraceStorePersistResult(result)

    expect(output).toContain('CodeMind Trace Store')
    expect(output).toContain('Outcome: STORED')
    expect(output).toContain('Frames stored: 4')
  })
})

describe('renderTraceStoreReplayResult', () => {
  it('renders replay result', () => {
    const lines = serializeTraceFrames(validFrames, '2026-06-26T00:00:00Z')
    const result = replayTraceFrames(lines, 'exec-1')
    const output = renderTraceStoreReplayResult(result)

    expect(output).toContain('CodeMind Trace Store Replay')
    expect(output).toContain('Outcome: REPLAYED')
    expect(output).toContain('Lineage valid: yes')
    expect(output).toContain('Invariants valid: yes')
  })
})
