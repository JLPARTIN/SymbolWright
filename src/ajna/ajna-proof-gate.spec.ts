import { describe, expect, it } from 'vitest';

import {
  buildAjnaProofGateReport,
  AJNA_PROOF_GATE_BLOCK_ID,
  AJNA_PROOF_GATE_PHASE_ID,
  AJNA_PROOF_GATE_PR_ID,
} from './ajna-proof-gate.js';

const ALL_READY_INPUT = {
  kernelTraceStatus: 'TRACE_PROOF_READY' as const,
  ajnaMatrixStatus: 'AJNA_PROOF_READY' as const,
  repoContextStatus: 'REPO_CONTEXT_PROOF_READY' as const,
  governanceStatus: 'GOVERNANCE_PROOF_READY' as const,
  runtimeBoundaryStatus: 'RUNTIME_BOUNDARY_PROOF_READY' as const,
  githubAdapterStatus: 'GITHUB_ADAPTER_PROOF_READY' as const,
};

describe('Ajna Proof Gate', () => {
  it('emits canonical metadata and keeps mutation flags false', () => {
    const report = buildAjnaProofGateReport(ALL_READY_INPUT);

    expect(report.blockId).toBe(AJNA_PROOF_GATE_BLOCK_ID);
    expect(report.prId).toBe(AJNA_PROOF_GATE_PR_ID);
    expect(report.phaseId).toBe(AJNA_PROOF_GATE_PHASE_ID);
    expect(report.mutationAllowed).toBe(false);
    expect(report.githubWriteAllowed).toBe(false);
    expect(report.providerInvocationAllowed).toBe(false);
  });

  it('returns ajnaMayDeclareMergeReady: true when all proofs are READY', () => {
    const report = buildAjnaProofGateReport(ALL_READY_INPUT);

    expect(report.ajnaMayDeclareMergeReady).toBe(true);
    expect(report.explanation.join('\n')).toContain('merge gate is open');
  });

  it('returns false when kernelTrace is PARTIAL', () => {
    const report = buildAjnaProofGateReport({
      ...ALL_READY_INPUT,
      kernelTraceStatus: 'TRACE_PROOF_PARTIAL',
    });

    expect(report.ajnaMayDeclareMergeReady).toBe(false);
    expect(report.explanation.join('\n')).toContain('merge gate is closed');
    expect(report.explanation.join('\n')).toContain('TRACE_PROOF_PARTIAL [FAIL]');
  });

  it('returns false when kernelTrace is BLOCKED', () => {
    const report = buildAjnaProofGateReport({
      ...ALL_READY_INPUT,
      kernelTraceStatus: 'TRACE_PROOF_BLOCKED',
    });

    expect(report.ajnaMayDeclareMergeReady).toBe(false);
  });

  it('returns false when kernelTrace is INVALID', () => {
    const report = buildAjnaProofGateReport({
      ...ALL_READY_INPUT,
      kernelTraceStatus: 'TRACE_PROOF_INVALID',
    });

    expect(report.ajnaMayDeclareMergeReady).toBe(false);
  });

  it('returns false when ajnaMatrix is not READY', () => {
    const report = buildAjnaProofGateReport({
      ...ALL_READY_INPUT,
      ajnaMatrixStatus: 'AJNA_PROOF_BLOCKED',
    });

    expect(report.ajnaMayDeclareMergeReady).toBe(false);
    expect(report.explanation.join('\n')).toContain('AJNA_PROOF_BLOCKED [FAIL]');
  });

  it('returns false when repoContext is not READY', () => {
    const report = buildAjnaProofGateReport({
      ...ALL_READY_INPUT,
      repoContextStatus: 'REPO_CONTEXT_PROOF_INVALID',
    });

    expect(report.ajnaMayDeclareMergeReady).toBe(false);
  });

  it('returns false when governance is not READY', () => {
    const report = buildAjnaProofGateReport({
      ...ALL_READY_INPUT,
      governanceStatus: 'GOVERNANCE_PROOF_PARTIAL',
    });

    expect(report.ajnaMayDeclareMergeReady).toBe(false);
  });

  it('returns false when runtimeBoundary is not READY', () => {
    const report = buildAjnaProofGateReport({
      ...ALL_READY_INPUT,
      runtimeBoundaryStatus: 'RUNTIME_BOUNDARY_PROOF_BLOCKED',
    });

    expect(report.ajnaMayDeclareMergeReady).toBe(false);
  });

  it('returns false when githubAdapter is not READY', () => {
    const report = buildAjnaProofGateReport({
      ...ALL_READY_INPUT,
      githubAdapterStatus: 'GITHUB_ADAPTER_PROOF_INVALID',
    });

    expect(report.ajnaMayDeclareMergeReady).toBe(false);
  });

  it('returns false when any proof status is missing', () => {
    const { kernelTraceStatus: _k, ...withoutKernel } = ALL_READY_INPUT;
    const report = buildAjnaProofGateReport(withoutKernel);

    expect(report.ajnaMayDeclareMergeReady).toBe(false);
    expect(report.explanation.join('\n')).toContain('kernelTrace: MISSING');
  });

  it('returns false when all proof statuses are missing', () => {
    const report = buildAjnaProofGateReport({});

    expect(report.ajnaMayDeclareMergeReady).toBe(false);
    expect(report.explanation.join('\n')).toContain('merge gate is closed');
  });

  it('produces deterministic explanation (stable line order, no random IDs)', () => {
    const r1 = buildAjnaProofGateReport(ALL_READY_INPUT);
    const r2 = buildAjnaProofGateReport(ALL_READY_INPUT);

    expect(r1.explanation).toEqual(r2.explanation);
    expect(r1.ajnaMayDeclareMergeReady).toBe(r2.ajnaMayDeclareMergeReady);
  });

  it('explanation contains PASS marker for each ready domain', () => {
    const report = buildAjnaProofGateReport(ALL_READY_INPUT);
    const text = report.explanation.join('\n');

    expect(text).toContain('kernelTrace: TRACE_PROOF_READY [PASS]');
    expect(text).toContain('ajnaMatrix: AJNA_PROOF_READY [PASS]');
    expect(text).toContain('repoContext: REPO_CONTEXT_PROOF_READY [PASS]');
    expect(text).toContain('governance: GOVERNANCE_PROOF_READY [PASS]');
    expect(text).toContain('runtimeBoundary: RUNTIME_BOUNDARY_PROOF_READY [PASS]');
    expect(text).toContain('githubAdapter: GITHUB_ADAPTER_PROOF_READY [PASS]');
  });
});
