import { describe, expect, it } from 'vitest';

import { buildAjnaOperatorSummary } from '../ajna-operator-summary.js';
import { runAjnaReviewPipeline } from '../ajna-review-pipeline.js';
import {
  ALL_FIXTURES,
  FIXTURE_GOVERNANCE_BLOCKED,
  FIXTURE_GITHUB_ADAPTER_INVALID,
  FIXTURE_HIGH_RISK_PROTECTED,
  FIXTURE_MERGE_READY,
  FIXTURE_MISSING_PROOF,
  FIXTURE_RUNTIME_BLOCKED,
} from './ajna-review-fixtures.js';

describe('Ajna Review Fixtures', () => {
  it('all fixtures are deterministic (re-running produces identical output)', () => {
    const rerun = runAjnaReviewPipeline({
      identity: FIXTURE_MERGE_READY.session.identity,
      proofStatuses: {
        kernelTraceStatus: FIXTURE_MERGE_READY.proofBundle.kernelTraceStatus,
        ajnaMatrixStatus: FIXTURE_MERGE_READY.proofBundle.ajnaMatrixStatus,
        repoContextStatus: FIXTURE_MERGE_READY.proofBundle.repoContextStatus,
        governanceStatus: FIXTURE_MERGE_READY.proofBundle.governanceStatus,
        runtimeBoundaryStatus: FIXTURE_MERGE_READY.proofBundle.runtimeBoundaryStatus,
        githubAdapterStatus: FIXTURE_MERGE_READY.proofBundle.githubAdapterStatus,
      },
    });

    expect(rerun.reviewReport.text).toBe(FIXTURE_MERGE_READY.reviewReport.text);
    expect(rerun.mergeDecision.state).toBe(FIXTURE_MERGE_READY.mergeDecision.state);
  });

  it('all fixtures include session identity', () => {
    for (const fixture of ALL_FIXTURES) {
      expect(fixture.session.identity.repository).toBeTruthy();
      expect(fixture.session.identity.pullRequestNumber).toBeGreaterThan(0);
      expect(fixture.session.identity.headSha).toBeTruthy();
      expect(fixture.session.identity.baseSha).toBeTruthy();
    }
  });

  it('all fixtures preserve non-execution flags', () => {
    for (const fixture of ALL_FIXTURES) {
      expect(fixture.runtimeBoundary.providerInvocationAllowed).toBe(false);
      expect(fixture.runtimeBoundary.repoMutationAllowed).toBe(false);
      expect(fixture.runtimeBoundary.githubWriteAllowed).toBe(false);
      expect(fixture.runtimeBoundary.commandExecutionAllowed).toBe(false);
    }
  });

  it('merge-ready fixture actually passes', () => {
    expect(FIXTURE_MERGE_READY.mergeDecision.state).toBe('MERGE_READY');
    expect(FIXTURE_MERGE_READY.riskSynthesis.riskLevel).toBe('LOW');
    expect(FIXTURE_MERGE_READY.proofBundle.allProofReady).toBe(true);
    expect(buildAjnaOperatorSummary(FIXTURE_MERGE_READY).operatorAction).toBe(
      'MERGE_ALLOWED',
    );
  });

  it('blocked fixture actually blocks', () => {
    expect(FIXTURE_RUNTIME_BLOCKED.mergeDecision.state).toBe('NEEDS_OPERATOR_REVIEW');
    expect(FIXTURE_RUNTIME_BLOCKED.riskSynthesis.riskLevel).toBe('CRITICAL');
    expect(
      buildAjnaOperatorSummary(FIXTURE_RUNTIME_BLOCKED).operatorAction,
    ).toBe('BLOCKED_BY_RUNTIME_BOUNDARY');
  });

  it('high-risk fixture requires operator review', () => {
    expect(FIXTURE_HIGH_RISK_PROTECTED.mergeDecision.state).toBe(
      'NEEDS_OPERATOR_REVIEW',
    );
    expect(FIXTURE_HIGH_RISK_PROTECTED.riskSynthesis.riskLevel).toBe('HIGH');
    expect(
      buildAjnaOperatorSummary(FIXTURE_HIGH_RISK_PROTECTED).operatorAction,
    ).toBe('REVIEW_REQUIRED');
  });

  it('missing-proof fixture has PROOF_MISSING action', () => {
    expect(
      buildAjnaOperatorSummary(FIXTURE_MISSING_PROOF).operatorAction,
    ).toBe('PROOF_MISSING');
    expect(FIXTURE_MISSING_PROOF.proofBundle.missingProofDomains).toHaveLength(6);
  });

  it('governance-blocked fixture has BLOCKED_BY_GOVERNANCE action', () => {
    expect(
      buildAjnaOperatorSummary(FIXTURE_GOVERNANCE_BLOCKED).operatorAction,
    ).toBe('BLOCKED_BY_GOVERNANCE');
  });

  it('github-adapter-invalid fixture has FIX_REQUIRED action', () => {
    expect(
      buildAjnaOperatorSummary(FIXTURE_GITHUB_ADAPTER_INVALID).operatorAction,
    ).toBe('FIX_REQUIRED');
  });

  it('all fixtures have distinct PR numbers', () => {
    const prNumbers = ALL_FIXTURES.map(
      (f) => f.session.identity.pullRequestNumber,
    );
    const unique = new Set(prNumbers);
    expect(unique.size).toBe(ALL_FIXTURES.length);
  });
});
