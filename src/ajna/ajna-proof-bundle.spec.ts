import { describe, expect, it } from 'vitest';

import {
  buildAjnaProofBundle,
  AJNA_PROOF_BUNDLE_BLOCK_ID,
  AJNA_PROOF_BUNDLE_PHASE_ID,
  AJNA_PROOF_BUNDLE_PR_ID,
} from './ajna-proof-bundle.js';

const ALL_READY_INPUT = {
  kernelTraceStatus: 'TRACE_PROOF_READY',
  ajnaMatrixStatus: 'AJNA_PROOF_READY',
  repoContextStatus: 'REPO_CONTEXT_PROOF_READY',
  governanceStatus: 'GOVERNANCE_PROOF_READY',
  runtimeBoundaryStatus: 'RUNTIME_BOUNDARY_PROOF_READY',
  githubAdapterStatus: 'GITHUB_ADAPTER_PROOF_READY',
};

describe('Ajna Proof Bundle', () => {
  it('emits canonical metadata', () => {
    const bundle = buildAjnaProofBundle(ALL_READY_INPUT);

    expect(bundle.blockId).toBe(AJNA_PROOF_BUNDLE_BLOCK_ID);
    expect(bundle.prId).toBe(AJNA_PROOF_BUNDLE_PR_ID);
    expect(bundle.phaseId).toBe(AJNA_PROOF_BUNDLE_PHASE_ID);
  });

  it('all proof ready → allProofReady true and gate open', () => {
    const bundle = buildAjnaProofBundle(ALL_READY_INPUT);

    expect(bundle.allProofReady).toBe(true);
    expect(bundle.proofGateStatus).toBe('PROOF_GATE_OPEN');
    expect(bundle.missingProofDomains).toEqual([]);
    expect(bundle.blockingProofDomains).toEqual([]);
    expect(bundle.invalidProofDomains).toEqual([]);
  });

  it('missing proof domain → allProofReady false', () => {
    const { kernelTraceStatus: _k, ...withoutKernel } = ALL_READY_INPUT;
    const bundle = buildAjnaProofBundle(withoutKernel);

    expect(bundle.allProofReady).toBe(false);
    expect(bundle.missingProofDomains).toContain('kernelTrace');
  });

  it('all domains missing → all listed as missing', () => {
    const bundle = buildAjnaProofBundle({});

    expect(bundle.allProofReady).toBe(false);
    expect(bundle.missingProofDomains).toHaveLength(6);
  });

  it('blocked proof domain → listed in blockingProofDomains', () => {
    const bundle = buildAjnaProofBundle({
      ...ALL_READY_INPUT,
      ajnaMatrixStatus: 'AJNA_PROOF_BLOCKED',
    });

    expect(bundle.allProofReady).toBe(false);
    expect(bundle.blockingProofDomains).toContain('ajnaMatrix');
    expect(bundle.proofGateStatus).toBe('PROOF_GATE_CLOSED');
  });

  it('invalid proof domain → listed in invalidProofDomains', () => {
    const bundle = buildAjnaProofBundle({
      ...ALL_READY_INPUT,
      runtimeBoundaryStatus: 'RUNTIME_BOUNDARY_PROOF_INVALID',
    });

    expect(bundle.allProofReady).toBe(false);
    expect(bundle.invalidProofDomains).toContain('runtimeBoundary');
  });

  it('deterministic missing domain order matches DOMAIN_LABELS order', () => {
    const bundle = buildAjnaProofBundle({
      repoContextStatus: 'REPO_CONTEXT_PROOF_READY',
    });

    expect(bundle.missingProofDomains).toEqual([
      'kernelTrace',
      'ajnaMatrix',
      'governance',
      'runtimeBoundary',
      'githubAdapter',
    ]);
  });

  it('deterministic blocking domain order', () => {
    const bundle = buildAjnaProofBundle({
      ...ALL_READY_INPUT,
      kernelTraceStatus: 'TRACE_PROOF_BLOCKED',
      governanceStatus: 'GOVERNANCE_PROOF_BLOCKED',
    });

    expect(bundle.blockingProofDomains).toEqual(['kernelTrace', 'governance']);
  });

  it('deterministic invalid domain order', () => {
    const bundle = buildAjnaProofBundle({
      ...ALL_READY_INPUT,
      ajnaMatrixStatus: 'AJNA_PROOF_INVALID',
      githubAdapterStatus: 'GITHUB_ADAPTER_PROOF_INVALID',
    });

    expect(bundle.invalidProofDomains).toEqual(['ajnaMatrix', 'githubAdapter']);
  });

  it('does not mutate proof inputs', () => {
    const input = { ...ALL_READY_INPUT };
    const frozen = Object.freeze(input);

    expect(() => buildAjnaProofBundle(frozen)).not.toThrow();
  });

  it('partial proof domain → allProofReady false and gate closed', () => {
    const bundle = buildAjnaProofBundle({
      ...ALL_READY_INPUT,
      governanceStatus: 'GOVERNANCE_PROOF_PARTIAL',
    });

    expect(bundle.allProofReady).toBe(false);
    expect(bundle.proofGateStatus).toBe('PROOF_GATE_CLOSED');
  });

  it('preserves individual status strings on output', () => {
    const bundle = buildAjnaProofBundle(ALL_READY_INPUT);

    expect(bundle.kernelTraceStatus).toBe('TRACE_PROOF_READY');
    expect(bundle.ajnaMatrixStatus).toBe('AJNA_PROOF_READY');
    expect(bundle.repoContextStatus).toBe('REPO_CONTEXT_PROOF_READY');
    expect(bundle.governanceStatus).toBe('GOVERNANCE_PROOF_READY');
    expect(bundle.runtimeBoundaryStatus).toBe('RUNTIME_BOUNDARY_PROOF_READY');
    expect(bundle.githubAdapterStatus).toBe('GITHUB_ADAPTER_PROOF_READY');
  });
});
