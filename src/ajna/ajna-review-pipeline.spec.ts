import { describe, expect, it } from 'vitest';

import {
  runAjnaReviewPipeline,
  AJNA_REVIEW_PIPELINE_BLOCK_ID,
  AJNA_REVIEW_PIPELINE_PHASE_ID,
  AJNA_REVIEW_PIPELINE_PR_ID,
} from './ajna-review-pipeline.js';

const IDENTITY = {
  repository: 'JLPARTIN/JLPARTIN-CodeMind',
  pullRequestNumber: 35,
  headSha: 'abc1234567890def',
  baseSha: 'def1234567890abc',
};

const ALL_READY_STATUSES = {
  kernelTraceStatus: 'TRACE_PROOF_READY',
  ajnaMatrixStatus: 'AJNA_PROOF_READY',
  repoContextStatus: 'REPO_CONTEXT_PROOF_READY',
  governanceStatus: 'GOVERNANCE_PROOF_READY',
  runtimeBoundaryStatus: 'RUNTIME_BOUNDARY_PROOF_READY',
  githubAdapterStatus: 'GITHUB_ADAPTER_PROOF_READY',
};

describe('Ajna Review Pipeline', () => {
  it('emits canonical metadata', () => {
    const report = runAjnaReviewPipeline({
      identity: IDENTITY,
      proofStatuses: ALL_READY_STATUSES,
    });

    expect(report.blockId).toBe(AJNA_REVIEW_PIPELINE_BLOCK_ID);
    expect(report.prId).toBe(AJNA_REVIEW_PIPELINE_PR_ID);
    expect(report.phaseId).toBe(AJNA_REVIEW_PIPELINE_PHASE_ID);
  });

  it('runs full merge-ready path', () => {
    const report = runAjnaReviewPipeline({
      identity: IDENTITY,
      proofStatuses: ALL_READY_STATUSES,
    });

    expect(report.mergeDecision.state).toBe('MERGE_READY');
    expect(report.riskSynthesis.riskLevel).toBe('LOW');
    expect(report.proofBundle.allProofReady).toBe(true);
    expect(report.reviewReport.text).toContain('MERGE_READY');
  });

  it('runs full blocked path', () => {
    const report = runAjnaReviewPipeline({
      identity: IDENTITY,
      proofStatuses: {
        ...ALL_READY_STATUSES,
        ajnaMatrixStatus: 'AJNA_PROOF_BLOCKED',
      },
    });

    expect(report.mergeDecision.state).toBe('BLOCKED');
    expect(report.riskSynthesis.riskLevel).toBe('BLOCKED');
    expect(report.proofBundle.blockingProofDomains).toContain('ajnaMatrix');
  });

  it('runs full operator-review path', () => {
    const report = runAjnaReviewPipeline({
      identity: IDENTITY,
      proofStatuses: ALL_READY_STATUSES,
      protectedFileCount: 3,
    });

    expect(report.mergeDecision.state).toBe('NEEDS_OPERATOR_REVIEW');
    expect(report.riskSynthesis.riskLevel).toBe('HIGH');
  });

  it('preserves non-execution flags', () => {
    const report = runAjnaReviewPipeline({
      identity: IDENTITY,
      proofStatuses: ALL_READY_STATUSES,
    });

    expect(report.runtimeBoundary.providerInvocationAllowed).toBe(false);
    expect(report.runtimeBoundary.repoMutationAllowed).toBe(false);
    expect(report.runtimeBoundary.githubWriteAllowed).toBe(false);
    expect(report.runtimeBoundary.commandExecutionAllowed).toBe(false);
  });

  it('does not mutate inputs', () => {
    const input = Object.freeze({
      identity: Object.freeze({ ...IDENTITY }),
      proofStatuses: Object.freeze({ ...ALL_READY_STATUSES }),
    });

    expect(() => runAjnaReviewPipeline(input)).not.toThrow();
  });

  it('produces stable deterministic report', () => {
    const input = { identity: IDENTITY, proofStatuses: ALL_READY_STATUSES };
    const r1 = runAjnaReviewPipeline(input);
    const r2 = runAjnaReviewPipeline(input);

    expect(r1.reviewReport.text).toBe(r2.reviewReport.text);
    expect(r1.mergeDecision.state).toBe(r2.mergeDecision.state);
    expect(r1.riskSynthesis.riskLevel).toBe(r2.riskSynthesis.riskLevel);
  });

  it('populates session with identity', () => {
    const report = runAjnaReviewPipeline({
      identity: IDENTITY,
      proofStatuses: ALL_READY_STATUSES,
    });

    expect(report.session.identity).toEqual(IDENTITY);
    expect(report.session.sessionId).toContain('JLPARTIN/JLPARTIN-CodeMind');
  });

  it('review report contains proof bundle summary', () => {
    const report = runAjnaReviewPipeline({
      identity: IDENTITY,
      proofStatuses: ALL_READY_STATUSES,
    });

    expect(report.reviewReport.text).toContain('Proof Bundle');
    expect(report.reviewReport.text).toContain('PROOF_GATE_OPEN');
  });
});
