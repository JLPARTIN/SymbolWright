import { describe, expect, it } from 'vitest';

import { runAjnaReviewPipeline } from './ajna-review-pipeline.js';
import {
  buildAjnaOperatorSummary,
  AJNA_OPERATOR_SUMMARY_BLOCK_ID,
  AJNA_OPERATOR_SUMMARY_PHASE_ID,
  AJNA_OPERATOR_SUMMARY_PR_ID,
} from './ajna-operator-summary.js';

const IDENTITY = {
  repository: 'JLPARTIN/JLPARTIN-CodeMind',
  pullRequestNumber: 35,
  headSha: 'abc1234567890def',
  baseSha: 'def1234567890abc',
};

const ALL_READY = {
  kernelTraceStatus: 'TRACE_PROOF_READY',
  ajnaMatrixStatus: 'AJNA_PROOF_READY',
  repoContextStatus: 'REPO_CONTEXT_PROOF_READY',
  governanceStatus: 'GOVERNANCE_PROOF_READY',
  runtimeBoundaryStatus: 'RUNTIME_BOUNDARY_PROOF_READY',
  githubAdapterStatus: 'GITHUB_ADAPTER_PROOF_READY',
};

function summaryFor(
  proofStatuses: Parameters<typeof runAjnaReviewPipeline>[0]['proofStatuses'],
  opts: { protectedFileCount?: number; requiresOperatorApproval?: boolean } = {},
) {
  const pipelineInput: Parameters<typeof runAjnaReviewPipeline>[0] = {
    identity: IDENTITY,
    proofStatuses,
    ...(opts.protectedFileCount !== undefined
      ? { protectedFileCount: opts.protectedFileCount }
      : {}),
    ...(opts.requiresOperatorApproval !== undefined
      ? { requiresOperatorApproval: opts.requiresOperatorApproval }
      : {}),
  };
  return buildAjnaOperatorSummary(runAjnaReviewPipeline(pipelineInput));
}

describe('Ajna Operator Summary', () => {
  it('emits canonical metadata', () => {
    const summary = summaryFor(ALL_READY);

    expect(summary.blockId).toBe(AJNA_OPERATOR_SUMMARY_BLOCK_ID);
    expect(summary.prId).toBe(AJNA_OPERATOR_SUMMARY_PR_ID);
    expect(summary.phaseId).toBe(AJNA_OPERATOR_SUMMARY_PHASE_ID);
  });

  it('summarizes merge-ready report', () => {
    const summary = summaryFor(ALL_READY);

    expect(summary.status).toBe('MERGE_READY');
    expect(summary.risk).toBe('LOW');
    expect(summary.operatorAction).toBe('MERGE_ALLOWED');
    expect(summary.proofScore).toBe('6/6');
    expect(summary.mergeReadiness).toBe('PROOF_GATE_OPEN');
  });

  it('summarizes blocked report', () => {
    const summary = summaryFor({
      ...ALL_READY,
      ajnaMatrixStatus: 'AJNA_PROOF_BLOCKED',
    });

    expect(summary.status).toBe('BLOCKED');
    expect(summary.operatorAction).toBe('FIX_REQUIRED');
    expect(summary.topBlockingReason).toContain('ajnaMatrix');
  });

  it('summarizes missing-proof report', () => {
    const summary = summaryFor({});

    expect(summary.operatorAction).toBe('PROOF_MISSING');
    expect(summary.proofScore).toBe('0/6');
    expect(summary.topBlockingReason).toContain('kernelTrace');
  });

  it('summarizes high-risk report', () => {
    const summary = summaryFor(ALL_READY, { protectedFileCount: 2 });

    expect(summary.risk).toBe('HIGH');
    expect(summary.status).toBe('NEEDS_OPERATOR_REVIEW');
    expect(summary.operatorAction).toBe('REVIEW_REQUIRED');
  });

  it('selects BLOCKED_BY_GOVERNANCE for blocked governance domain', () => {
    const summary = summaryFor({
      ...ALL_READY,
      governanceStatus: 'GOVERNANCE_PROOF_BLOCKED',
    });

    expect(summary.operatorAction).toBe('BLOCKED_BY_GOVERNANCE');
  });

  it('selects BLOCKED_BY_RUNTIME_BOUNDARY for invalid runtime boundary', () => {
    const summary = summaryFor({
      ...ALL_READY,
      runtimeBoundaryStatus: 'RUNTIME_BOUNDARY_PROOF_INVALID',
    });

    expect(summary.operatorAction).toBe('BLOCKED_BY_RUNTIME_BOUNDARY');
  });

  it('selects highest-priority operator action', () => {
    const summary = summaryFor({
      ...ALL_READY,
      runtimeBoundaryStatus: 'RUNTIME_BOUNDARY_PROOF_INVALID',
      governanceStatus: 'GOVERNANCE_PROOF_INVALID',
    });

    expect(summary.operatorAction).toBe('BLOCKED_BY_RUNTIME_BOUNDARY');
  });

  it('stable output order (deterministic)', () => {
    const s1 = summaryFor(ALL_READY);
    const s2 = summaryFor(ALL_READY);

    expect(s1.status).toBe(s2.status);
    expect(s1.risk).toBe(s2.risk);
    expect(s1.operatorAction).toBe(s2.operatorAction);
    expect(s1.proofScore).toBe(s2.proofScore);
    expect(s1.topBlockingReason).toBe(s2.topBlockingReason);
  });

  it('keeps mutation flags false', () => {
    const summary = summaryFor(ALL_READY);

    expect(summary.mutationAllowed).toBe(false);
    expect(summary.githubWriteAllowed).toBe(false);
    expect(summary.providerInvocationAllowed).toBe(false);
  });
});
