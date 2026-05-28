import { describe, expect, it } from 'vitest';

import { AgentKernelTraceReplayService } from '../kernel/agent-kernel-trace-replay.service.js';
import type {
  AgentKernelBlockId,
  AgentKernelTraceFrame,
  AgentKernelTracePayloadKind,
} from '../kernel/agent-kernel-trace.types.js';
import {
  buildCodemindKernelTraceProofReport,
  CODEMIND_KERNEL_TRACE_PROOF_BLOCK_ID,
  CODEMIND_KERNEL_TRACE_PROOF_PHASE_ID,
  CODEMIND_KERNEL_TRACE_PROOF_PR_ID,
} from './codemind-kernel-trace-proof.js';

const EXECUTION_ID = 'trace-proof-execution-01';

function frame(
  blockId: AgentKernelBlockId,
  kind: AgentKernelTracePayloadKind,
): AgentKernelTraceFrame {
  return {
    blockId,
    prId: `PR-AK-${blockId.slice(-2)}`,
    phaseId: `Phase-16G-AK-${blockId.slice(-2)}`,
    executionId: EXECUTION_ID,
    timestamp: '2026-05-28T00:00:00.000Z',
    payloadSummary: { kind },
    invariants: {
      providerInvoked: false,
      repoMutationAllowed: false,
      commandExecutionAllowed: false,
    },
    warnings: [],
  };
}

function replay(frames: readonly AgentKernelTraceFrame[]) {
  return new AgentKernelTraceReplayService().replay({
    executionId: EXECUTION_ID,
    frames,
  });
}

describe('CodeMind kernel trace proof', () => {
  it('emits canonical metadata and preserves non-execution guarantees', () => {
    const report = buildCodemindKernelTraceProofReport({
      replayReport: replay([frame('AGENT-KERNEL-01', 'PLANNING')]),
    });

    expect(report.blockId).toBe(CODEMIND_KERNEL_TRACE_PROOF_BLOCK_ID);
    expect(report.prId).toBe(CODEMIND_KERNEL_TRACE_PROOF_PR_ID);
    expect(report.phaseId).toBe(CODEMIND_KERNEL_TRACE_PROOF_PHASE_ID);
    expect(report.sourceReplayBlockId).toBe('AGENT-KERNEL-07');
    expect(report.providerInvocationAllowed).toBe(false);
    expect(report.repoMutationAllowed).toBe(false);
    expect(report.commandExecutionAllowed).toBe(false);
  });

  it('marks proof ready when required kernel trace endpoints are observed and replay is valid', () => {
    const report = buildCodemindKernelTraceProofReport({
      replayReport: replay([
        frame('AGENT-KERNEL-01', 'PLANNING'),
        frame('AGENT-KERNEL-02', 'WORKFLOW_VALIDATION'),
        frame('AGENT-KERNEL-03', 'SKILL_VALIDATION'),
        frame('AGENT-KERNEL-04', 'CONTEXT_PACKET'),
        frame('AGENT-KERNEL-05', 'ROUTE_RECOMMENDATION'),
        frame('AGENT-KERNEL-06', 'ROUTE_PREFLIGHT'),
      ]),
      requiredBlockIds: ['AGENT-KERNEL-01', 'AGENT-KERNEL-06'],
    });

    expect(report.status).toBe('TRACE_PROOF_READY');
    expect(report.lineageValid).toBe(true);
    expect(report.metadataValid).toBe(true);
    expect(report.invariantsValid).toBe(true);
    expect(report.missingBlockIds).toEqual([]);
    expect(report.summary).toBe('2/2 kernel trace proof blocks observed.');
  });

  it('marks proof partial when required trace evidence is missing', () => {
    const report = buildCodemindKernelTraceProofReport({
      replayReport: replay([
        frame('AGENT-KERNEL-01', 'PLANNING'),
        frame('AGENT-KERNEL-02', 'WORKFLOW_VALIDATION'),
      ]),
      requiredBlockIds: ['AGENT-KERNEL-01', 'AGENT-KERNEL-06'],
    });

    expect(report.status).toBe('TRACE_PROOF_PARTIAL');
    expect(report.missingBlockIds).toEqual(['AGENT-KERNEL-06']);
    expect(report.findings).toContain('Missing replay evidence for AGENT-KERNEL-06.');
  });

  it('marks proof invalid when replay lineage or invariants fail', () => {
    const invalidFrame: AgentKernelTraceFrame = {
      ...frame('AGENT-KERNEL-02', 'WORKFLOW_VALIDATION'),
      invariants: {
        providerInvoked: true,
        repoMutationAllowed: false,
        commandExecutionAllowed: false,
      },
    };

    const report = buildCodemindKernelTraceProofReport({
      replayReport: replay([invalidFrame]),
      requiredBlockIds: ['AGENT-KERNEL-02'],
    });

    expect(report.status).toBe('TRACE_PROOF_INVALID');
    expect(report.lineageValid).toBe(false);
    expect(report.invariantsValid).toBe(false);
    expect(report.findings).toContain('providerInvoked invariant violated in AGENT-KERNEL-02.');
  });

  it('marks proof blocked when operator blocking notes are present', () => {
    const report = buildCodemindKernelTraceProofReport({
      replayReport: replay([
        frame('AGENT-KERNEL-01', 'PLANNING'),
        frame('AGENT-KERNEL-02', 'WORKFLOW_VALIDATION'),
      ]),
      requiredBlockIds: ['AGENT-KERNEL-01', 'AGENT-KERNEL-02'],
      blockingNotes: ['Awaiting operator approval for trace replay promotion.'],
    });

    expect(report.status).toBe('TRACE_PROOF_BLOCKED');
    expect(report.blockingNotes).toEqual(['Awaiting operator approval for trace replay promotion.']);
    expect(report.findings).toContain('Blocking note: Awaiting operator approval for trace replay promotion.');
  });
});
