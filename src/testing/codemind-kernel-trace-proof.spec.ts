import { describe, expect, it } from 'vitest';

import {
  buildCodemindKernelTraceProofReport,
  CODEMIND_KERNEL_TRACE_PROOF_BLOCK_ID,
  CODEMIND_KERNEL_TRACE_PROOF_PHASE_ID,
  CODEMIND_KERNEL_TRACE_PROOF_PR_ID,
} from './codemind-kernel-trace-proof.js';
import { type AgentKernelTraceFrame } from '../kernel/agent-kernel-trace.types.js';

function makeFrame(
  blockId: AgentKernelTraceFrame['blockId'],
  executionId = 'exec-001',
  overrides: Partial<AgentKernelTraceFrame> = {},
): AgentKernelTraceFrame {
  const blockNum = blockId.slice(-2);
  return {
    blockId,
    prId: `PR-AK-${blockNum}`,
    phaseId: `Phase-16G-AK-${blockNum}`,
    executionId,
    timestamp: '2026-05-29T00:00:00.000Z',
    payloadSummary: { kind: 'PLANNING' },
    invariants: {
      providerInvoked: false,
      repoMutationAllowed: false,
      commandExecutionAllowed: false,
    },
    warnings: [],
    ...overrides,
  };
}

describe('CodeMind Kernel Trace Proof', () => {
  it('emits canonical metadata and keeps invariants false', () => {
    const report = buildCodemindKernelTraceProofReport({
      executionId: 'exec-001',
      requiredBlockIds: ['AGENT-KERNEL-01'],
      evidenceFrames: [makeFrame('AGENT-KERNEL-01')],
    });

    expect(report.blockId).toBe(CODEMIND_KERNEL_TRACE_PROOF_BLOCK_ID);
    expect(report.prId).toBe(CODEMIND_KERNEL_TRACE_PROOF_PR_ID);
    expect(report.phaseId).toBe(CODEMIND_KERNEL_TRACE_PROOF_PHASE_ID);
    expect(report.invariants.providerInvoked).toBe(false);
    expect(report.invariants.repoMutationAllowed).toBe(false);
    expect(report.invariants.commandExecutionAllowed).toBe(false);
  });

  it('returns TRACE_PROOF_READY when all required blocks are covered', () => {
    const report = buildCodemindKernelTraceProofReport({
      executionId: 'exec-001',
      requiredBlockIds: ['AGENT-KERNEL-01', 'AGENT-KERNEL-02'],
      evidenceFrames: [
        makeFrame('AGENT-KERNEL-01'),
        makeFrame('AGENT-KERNEL-02'),
      ],
    });

    expect(report.status).toBe('TRACE_PROOF_READY');
    expect(report.coveredBlockIds).toEqual(['AGENT-KERNEL-01', 'AGENT-KERNEL-02']);
    expect(report.missingBlockIds).toEqual([]);
    expect(report.summary).toContain('2/2');
  });

  it('returns TRACE_PROOF_PARTIAL when only some required blocks are covered', () => {
    const report = buildCodemindKernelTraceProofReport({
      executionId: 'exec-001',
      requiredBlockIds: ['AGENT-KERNEL-01', 'AGENT-KERNEL-02', 'AGENT-KERNEL-03'],
      evidenceFrames: [
        makeFrame('AGENT-KERNEL-01'),
        makeFrame('AGENT-KERNEL-02'),
      ],
    });

    expect(report.status).toBe('TRACE_PROOF_PARTIAL');
    expect(report.coveredBlockIds).toEqual(['AGENT-KERNEL-01', 'AGENT-KERNEL-02']);
    expect(report.missingBlockIds).toEqual(['AGENT-KERNEL-03']);
    expect(report.summary).toContain('2/3');
  });

  it('returns TRACE_PROOF_BLOCKED when blocking notes are present', () => {
    const report = buildCodemindKernelTraceProofReport({
      executionId: 'exec-001',
      requiredBlockIds: ['AGENT-KERNEL-01'],
      evidenceFrames: [makeFrame('AGENT-KERNEL-01')],
      blockingNotes: ['AK-01 output under operator review.'],
    });

    expect(report.status).toBe('TRACE_PROOF_BLOCKED');
    expect(report.blockingNotes).toEqual(['AK-01 output under operator review.']);
    expect(report.summary).toContain('blocked');
  });

  it('returns TRACE_PROOF_INVALID when lineage is out of order', () => {
    const report = buildCodemindKernelTraceProofReport({
      executionId: 'exec-001',
      requiredBlockIds: ['AGENT-KERNEL-01', 'AGENT-KERNEL-02'],
      evidenceFrames: [
        makeFrame('AGENT-KERNEL-02'),
        makeFrame('AGENT-KERNEL-01'),
      ],
    });

    expect(report.status).toBe('TRACE_PROOF_INVALID');
    expect(report.replayErrors.length).toBeGreaterThan(0);
    expect(report.summary).toContain('invalid');
  });

  it('returns TRACE_PROOF_INVALID when invariants are violated', () => {
    const report = buildCodemindKernelTraceProofReport({
      executionId: 'exec-001',
      requiredBlockIds: ['AGENT-KERNEL-01'],
      evidenceFrames: [
        makeFrame('AGENT-KERNEL-01', 'exec-001', {
          invariants: {
            providerInvoked: true as unknown as false,
            repoMutationAllowed: false,
            commandExecutionAllowed: false,
          },
        }),
      ],
    });

    expect(report.status).toBe('TRACE_PROOF_INVALID');
    expect(report.replayErrors.some((e) => e.includes('providerInvoked'))).toBe(true);
  });

  it('drops frames with mismatched executionId and marks partial', () => {
    const report = buildCodemindKernelTraceProofReport({
      executionId: 'exec-001',
      requiredBlockIds: ['AGENT-KERNEL-01', 'AGENT-KERNEL-02'],
      evidenceFrames: [
        makeFrame('AGENT-KERNEL-01', 'exec-001'),
        makeFrame('AGENT-KERNEL-02', 'exec-WRONG'),
      ],
    });

    expect(report.coveredBlockIds).toEqual(['AGENT-KERNEL-01']);
    expect(report.missingBlockIds).toEqual(['AGENT-KERNEL-02']);
    expect(report.status).toBe('TRACE_PROOF_PARTIAL');
  });

  it('produces a deterministic summary with no random IDs', () => {
    const report1 = buildCodemindKernelTraceProofReport({
      executionId: 'exec-A',
      requiredBlockIds: ['AGENT-KERNEL-01'],
      evidenceFrames: [makeFrame('AGENT-KERNEL-01', 'exec-A')],
    });
    const report2 = buildCodemindKernelTraceProofReport({
      executionId: 'exec-A',
      requiredBlockIds: ['AGENT-KERNEL-01'],
      evidenceFrames: [makeFrame('AGENT-KERNEL-01', 'exec-A')],
    });

    expect(report1.summary).toBe(report2.summary);
    expect(report1.status).toBe(report2.status);
  });
});
