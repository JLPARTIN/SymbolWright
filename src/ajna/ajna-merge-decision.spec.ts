import { describe, expect, it } from 'vitest';

import { buildAjnaProofBundle } from './ajna-proof-bundle.js';
import {
  buildAjnaMergeDecision,
  AJNA_MERGE_DECISION_BLOCK_ID,
  AJNA_MERGE_DECISION_PHASE_ID,
  AJNA_MERGE_DECISION_PR_ID,
} from './ajna-merge-decision.js';
import { synthesizeAjnaRisk } from './ajna-risk-synthesis.js';

const ALL_READY_INPUT = {
  kernelTraceStatus: 'TRACE_PROOF_READY',
  ajnaMatrixStatus: 'AJNA_PROOF_READY',
  repoContextStatus: 'REPO_CONTEXT_PROOF_READY',
  governanceStatus: 'GOVERNANCE_PROOF_READY',
  runtimeBoundaryStatus: 'RUNTIME_BOUNDARY_PROOF_READY',
  githubAdapterStatus: 'GITHUB_ADAPTER_PROOF_READY',
};

function makeDecision(
  bundleInput: Parameters<typeof buildAjnaProofBundle>[0],
  opts: { protectedFileCount?: number; repoImpactLevel?: string; requiresOperatorApproval?: boolean } = {},
) {
  const proofBundle = buildAjnaProofBundle(bundleInput);
  const riskSynthesis = synthesizeAjnaRisk({
    proofBundle,
    ...(opts.protectedFileCount !== undefined
      ? { protectedFileCount: opts.protectedFileCount }
      : {}),
    ...(opts.repoImpactLevel !== undefined
      ? { repoImpactLevel: opts.repoImpactLevel }
      : {}),
  });
  const decisionInput: Parameters<typeof buildAjnaMergeDecision>[0] = {
    proofBundle,
    riskSynthesis,
    ...(opts.requiresOperatorApproval !== undefined
      ? { requiresOperatorApproval: opts.requiresOperatorApproval }
      : {}),
  };
  return buildAjnaMergeDecision(decisionInput);
}

describe('Ajna Merge Decision', () => {
  it('emits canonical metadata', () => {
    const decision = makeDecision(ALL_READY_INPUT);

    expect(decision.blockId).toBe(AJNA_MERGE_DECISION_BLOCK_ID);
    expect(decision.prId).toBe(AJNA_MERGE_DECISION_PR_ID);
    expect(decision.phaseId).toBe(AJNA_MERGE_DECISION_PHASE_ID);
  });

  it('MERGE_READY only when all gates pass', () => {
    const decision = makeDecision(ALL_READY_INPUT);

    expect(decision.state).toBe('MERGE_READY');
    expect(decision.reasons.join('\n')).toContain('All proof domains ready');
  });

  it('NOT_READY when proof is partial', () => {
    const { kernelTraceStatus: _k, ...partial } = ALL_READY_INPUT;
    const proofBundle = buildAjnaProofBundle(partial);
    const riskSynthesis = synthesizeAjnaRisk({ proofBundle });
    const decision = buildAjnaMergeDecision({ proofBundle, riskSynthesis });

    expect(decision.state).toBe('BLOCKED');
    expect(decision.reasons.join('\n')).toContain('BLOCKED');
  });

  it('BLOCKED when proof is blocked', () => {
    const decision = makeDecision({
      ...ALL_READY_INPUT,
      ajnaMatrixStatus: 'AJNA_PROOF_BLOCKED',
    });

    expect(decision.state).toBe('BLOCKED');
    expect(decision.reasons.join('\n')).toContain('BLOCKED');
  });

  it('BLOCKED when proof is invalid (non-critical domain)', () => {
    const decision = makeDecision({
      ...ALL_READY_INPUT,
      kernelTraceStatus: 'TRACE_PROOF_INVALID',
    });

    expect(decision.state).toBe('BLOCKED');
  });

  it('NEEDS_OPERATOR_REVIEW for high-risk protected path changes', () => {
    const decision = makeDecision(ALL_READY_INPUT, { protectedFileCount: 3 });

    expect(decision.state).toBe('NEEDS_OPERATOR_REVIEW');
    expect(decision.reasons.join('\n')).toContain('HIGH');
  });

  it('NEEDS_OPERATOR_REVIEW when governance requires human approval', () => {
    const decision = makeDecision(ALL_READY_INPUT, {
      requiresOperatorApproval: true,
    });

    expect(decision.state).toBe('NEEDS_OPERATOR_REVIEW');
    expect(decision.reasons.join('\n')).toContain('operator approval');
  });

  it('NEEDS_OPERATOR_REVIEW when risk is CRITICAL', () => {
    const decision = makeDecision({
      ...ALL_READY_INPUT,
      governanceStatus: 'GOVERNANCE_PROOF_INVALID',
    });

    expect(decision.state).toBe('NEEDS_OPERATOR_REVIEW');
  });

  it('MERGE_READY with MODERATE risk (repo impact only)', () => {
    const decision = makeDecision(ALL_READY_INPUT, {
      repoImpactLevel: 'MODERATE',
    });

    expect(decision.state).toBe('MERGE_READY');
  });

  it('deterministic decision reason order', () => {
    const d1 = makeDecision(ALL_READY_INPUT);
    const d2 = makeDecision(ALL_READY_INPUT);

    expect(d1.reasons).toEqual(d2.reasons);
    expect(d1.state).toBe(d2.state);
  });

  it('keeps mutationAllowed false', () => {
    expect(makeDecision(ALL_READY_INPUT).mutationAllowed).toBe(false);
  });

  it('keeps githubWriteAllowed false', () => {
    expect(makeDecision(ALL_READY_INPUT).githubWriteAllowed).toBe(false);
  });

  it('keeps providerInvocationAllowed false', () => {
    expect(makeDecision(ALL_READY_INPUT).providerInvocationAllowed).toBe(false);
  });
});
