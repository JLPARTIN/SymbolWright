import { describe, expect, it } from 'vitest';

import { buildAjnaProofBundle } from './ajna-proof-bundle.js';
import {
  synthesizeAjnaRisk,
  AJNA_RISK_SYNTHESIS_BLOCK_ID,
  AJNA_RISK_SYNTHESIS_PHASE_ID,
  AJNA_RISK_SYNTHESIS_PR_ID,
} from './ajna-risk-synthesis.js';

const ALL_READY = {
  kernelTraceStatus: 'TRACE_PROOF_READY',
  ajnaMatrixStatus: 'AJNA_PROOF_READY',
  repoContextStatus: 'REPO_CONTEXT_PROOF_READY',
  governanceStatus: 'GOVERNANCE_PROOF_READY',
  runtimeBoundaryStatus: 'RUNTIME_BOUNDARY_PROOF_READY',
  githubAdapterStatus: 'GITHUB_ADAPTER_PROOF_READY',
};

const readyBundle = () => buildAjnaProofBundle(ALL_READY);

describe('Ajna Risk Synthesis', () => {
  it('emits canonical metadata', () => {
    const result = synthesizeAjnaRisk({ proofBundle: readyBundle() });

    expect(result.blockId).toBe(AJNA_RISK_SYNTHESIS_BLOCK_ID);
    expect(result.prId).toBe(AJNA_RISK_SYNTHESIS_PR_ID);
    expect(result.phaseId).toBe(AJNA_RISK_SYNTHESIS_PHASE_ID);
  });

  it('LOW when all proof ready and no protected paths changed', () => {
    const result = synthesizeAjnaRisk({ proofBundle: readyBundle() });

    expect(result.riskLevel).toBe('LOW');
    expect(result.explanation.join('\n')).toContain('all proof domains ready');
  });

  it('MODERATE when proof ready but repo impact exists', () => {
    const result = synthesizeAjnaRisk({
      proofBundle: readyBundle(),
      repoImpactLevel: 'MODERATE',
    });

    expect(result.riskLevel).toBe('MODERATE');
    expect(result.explanation.join('\n')).toContain('MODERATE');
  });

  it('HIGH when protected paths changed and proof ready', () => {
    const result = synthesizeAjnaRisk({
      proofBundle: readyBundle(),
      protectedFileCount: 2,
    });

    expect(result.riskLevel).toBe('HIGH');
    expect(result.explanation.join('\n')).toContain('2 protected file');
  });

  it('BLOCKED when proof incomplete (even with protected paths)', () => {
    const { kernelTraceStatus: _k, ...partial } = ALL_READY;
    const result = synthesizeAjnaRisk({
      proofBundle: buildAjnaProofBundle(partial),
      protectedFileCount: 1,
    });

    expect(result.riskLevel).toBe('BLOCKED');
  });

  it('CRITICAL when governance proof is invalid', () => {
    const result = synthesizeAjnaRisk({
      proofBundle: buildAjnaProofBundle({
        ...ALL_READY,
        governanceStatus: 'GOVERNANCE_PROOF_INVALID',
      }),
    });

    expect(result.riskLevel).toBe('CRITICAL');
    expect(result.explanation.join('\n')).toContain('governance');
  });

  it('CRITICAL when runtime boundary proof is invalid', () => {
    const result = synthesizeAjnaRisk({
      proofBundle: buildAjnaProofBundle({
        ...ALL_READY,
        runtimeBoundaryStatus: 'RUNTIME_BOUNDARY_PROOF_INVALID',
      }),
    });

    expect(result.riskLevel).toBe('CRITICAL');
  });

  it('BLOCKED when any required proof domain is blocked', () => {
    const result = synthesizeAjnaRisk({
      proofBundle: buildAjnaProofBundle({
        ...ALL_READY,
        ajnaMatrixStatus: 'AJNA_PROOF_BLOCKED',
      }),
    });

    expect(result.riskLevel).toBe('BLOCKED');
    expect(result.explanation.join('\n')).toContain('blocked');
  });

  it('BLOCKED when proof gate refuses merge readiness', () => {
    const { kernelTraceStatus: _k, ...withoutKernel } = ALL_READY;
    const result = synthesizeAjnaRisk({
      proofBundle: buildAjnaProofBundle(withoutKernel),
    });

    expect(result.riskLevel).not.toBe('LOW');
    expect(result.riskLevel).not.toBe('MODERATE');
  });

  it('deterministic risk explanation', () => {
    const r1 = synthesizeAjnaRisk({ proofBundle: readyBundle() });
    const r2 = synthesizeAjnaRisk({ proofBundle: readyBundle() });

    expect(r1.explanation).toEqual(r2.explanation);
    expect(r1.riskLevel).toBe(r2.riskLevel);
  });

  it('keeps mutationAllowed false', () => {
    expect(synthesizeAjnaRisk({ proofBundle: readyBundle() }).mutationAllowed).toBe(false);
  });

  it('keeps githubWriteAllowed false', () => {
    expect(synthesizeAjnaRisk({ proofBundle: readyBundle() }).githubWriteAllowed).toBe(false);
  });

  it('keeps providerInvocationAllowed false', () => {
    expect(
      synthesizeAjnaRisk({ proofBundle: readyBundle() }).providerInvocationAllowed,
    ).toBe(false);
  });

  it('BLOCKED when proof incomplete and no protected paths', () => {
    const { governanceStatus: _g, ...partial } = ALL_READY;
    const result = synthesizeAjnaRisk({
      proofBundle: buildAjnaProofBundle(partial),
    });

    expect(result.riskLevel).toBe('BLOCKED');
    expect(result.explanation.join('\n')).toContain('missing');
  });
});
