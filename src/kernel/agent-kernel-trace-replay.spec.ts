import { describe, expect, it } from 'vitest';

import { AgentKernelTraceReplayService } from './agent-kernel-trace-replay.service.js';
import type {
  AgentKernelBlockId,
  AgentKernelTraceFrame,
  AgentKernelTracePayloadKind,
} from './agent-kernel-trace.types.js';

const BLOCKS: readonly AgentKernelBlockId[] = [
  'AGENT-KERNEL-01',
  'AGENT-KERNEL-02',
  'AGENT-KERNEL-03',
  'AGENT-KERNEL-04',
  'AGENT-KERNEL-05',
  'AGENT-KERNEL-06',
];

const KINDS: readonly AgentKernelTracePayloadKind[] = [
  'PLANNING',
  'WORKFLOW_VALIDATION',
  'SKILL_VALIDATION',
  'CONTEXT_PACKET',
  'ROUTE_RECOMMENDATION',
  'ROUTE_PREFLIGHT',
];

function makeFrame(
  blockId: AgentKernelBlockId,
  index: number,
  overrides: Partial<AgentKernelTraceFrame> = {},
): AgentKernelTraceFrame {
  const suffix = blockId.slice(-2);

  return {
    blockId,
    prId: `PR-AK-${suffix}`,
    phaseId: `Phase-16G-AK-${suffix}`,
    executionId: 'exec-1',
    timestamp: new Date(`2026-05-28T00:0${index}:00.000Z`).toISOString(),
    payloadSummary: {
      kind: KINDS[index] ?? 'PLANNING',
      providerReady: index >= 3,
    },
    invariants: {
      providerInvoked: false,
      repoMutationAllowed: false,
      commandExecutionAllowed: false,
    },
    warnings: [],
    ...overrides,
  };
}

function makeValidFrames(): readonly AgentKernelTraceFrame[] {
  return BLOCKS.map((blockId, index) => makeFrame(blockId, index));
}

describe('AGENT-KERNEL-07 deterministic trace replay', () => {
  it('accepts a valid AK-01 through AK-06 trace chain', () => {
    const service = new AgentKernelTraceReplayService();
    const report = service.replay({ executionId: 'exec-1', frames: makeValidFrames() });

    expect(report.blockId).toBe('AGENT-KERNEL-07');
    expect(report.prId).toBe('PR-AK-07');
    expect(report.phaseId).toBe('Phase-16G-AK-07');
    expect(report.lineageValid).toBe(true);
    expect(report.blockIdValid).toBe(true);
    expect(report.invariantsValid).toBe(true);
    expect(report.summary.frameCount).toBe(6);
    expect(report.summary.firstBlockId).toBe('AGENT-KERNEL-01');
    expect(report.summary.lastBlockId).toBe('AGENT-KERNEL-06');
  });

  it('rejects out-of-order lineage', () => {
    const service = new AgentKernelTraceReplayService();
    const frames = [
      makeFrame('AGENT-KERNEL-01', 0),
      makeFrame('AGENT-KERNEL-03', 1),
      makeFrame('AGENT-KERNEL-02', 2),
    ];
    const report = service.replay({ executionId: 'exec-1', frames });

    expect(report.lineageValid).toBe(false);
    expect(report.lineageErrors.length).toBeGreaterThan(0);
  });

  it('rejects bad PR, phase, and timestamp metadata', () => {
    const service = new AgentKernelTraceReplayService();
    const frames = [
      makeFrame('AGENT-KERNEL-01', 0, {
        prId: 'PR-WRONG-01',
        phaseId: 'Phase-Wrong-01',
        timestamp: 'not-a-timestamp',
      }),
    ];
    const report = service.replay({ executionId: 'exec-1', frames });

    expect(report.blockIdValid).toBe(false);
    expect(report.blockIdErrors).toHaveLength(3);
  });

  it('rejects invariant flips across the chain', () => {
    const service = new AgentKernelTraceReplayService();
    const frames = [
      makeFrame('AGENT-KERNEL-01', 0),
      makeFrame('AGENT-KERNEL-02', 1, {
        invariants: {
          providerInvoked: true,
          repoMutationAllowed: true,
          commandExecutionAllowed: true,
        },
      }),
    ];
    const report = service.replay({ executionId: 'exec-1', frames });

    expect(report.invariantsValid).toBe(false);
    expect(report.invariantViolations).toHaveLength(3);
    expect(report.invariantViolations[0]).toContain('providerInvoked');
  });

  it('aggregates warnings with block lineage labels', () => {
    const service = new AgentKernelTraceReplayService();
    const frames = [
      makeFrame('AGENT-KERNEL-01', 0, { warnings: ['planning warning'] }),
      makeFrame('AGENT-KERNEL-02', 1, { warnings: ['validation warning'] }),
    ];
    const report = service.replay({ executionId: 'exec-1', frames });

    expect(report.summary.warningCount).toBe(2);
    expect(report.warnings).toContain('AGENT-KERNEL-01: planning warning');
    expect(report.warnings).toContain('AGENT-KERNEL-02: validation warning');
  });

  it('filters mismatched execution ids and records the drop', () => {
    const service = new AgentKernelTraceReplayService();
    const frames = [
      makeFrame('AGENT-KERNEL-01', 0),
      makeFrame('AGENT-KERNEL-02', 1, { executionId: 'other-exec' }),
    ];
    const report = service.replay({ executionId: 'exec-1', frames });

    expect(report.summary.frameCount).toBe(1);
    expect(report.lineageValid).toBe(false);
    expect(report.lineageErrors[0]).toContain('Dropped 1 frame');
  });
});
