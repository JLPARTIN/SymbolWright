import { describe, expect, it } from 'vitest';

import { buildAjnaProofBundle } from './ajna-proof-bundle.js';
import { buildAjnaMergeDecision } from './ajna-merge-decision.js';
import { synthesizeAjnaRisk } from './ajna-risk-synthesis.js';
import { buildAjnaReviewSession } from './ajna-review-session.js';
import {
  composeAjnaReviewReport,
  AJNA_REVIEW_REPORT_COMPOSER_BLOCK_ID,
  AJNA_REVIEW_REPORT_COMPOSER_PHASE_ID,
  AJNA_REVIEW_REPORT_COMPOSER_PR_ID,
} from './ajna-review-report-composer.js';

const IDENTITY = {
  repository: 'JLPARTIN/JLPARTIN-CodeMind',
  pullRequestNumber: 35,
  headSha: 'abc1234567890def',
  baseSha: 'def1234567890abc',
};

const ALL_READY_BUNDLE_INPUT = {
  kernelTraceStatus: 'TRACE_PROOF_READY',
  ajnaMatrixStatus: 'AJNA_PROOF_READY',
  repoContextStatus: 'REPO_CONTEXT_PROOF_READY',
  governanceStatus: 'GOVERNANCE_PROOF_READY',
  runtimeBoundaryStatus: 'RUNTIME_BOUNDARY_PROOF_READY',
  githubAdapterStatus: 'GITHUB_ADAPTER_PROOF_READY',
};

function buildReadyReport(format: 'plain' | 'markdown' | 'compact') {
  const session = buildAjnaReviewSession({ identity: IDENTITY });
  const proofBundle = buildAjnaProofBundle(ALL_READY_BUNDLE_INPUT);
  const riskSynthesis = synthesizeAjnaRisk({ proofBundle });
  const mergeDecision = buildAjnaMergeDecision({ proofBundle, riskSynthesis });
  return composeAjnaReviewReport({
    session,
    proofBundle,
    riskSynthesis,
    mergeDecision,
    format,
  });
}

function buildBlockedReport(format: 'plain' | 'markdown' | 'compact') {
  const session = buildAjnaReviewSession({ identity: IDENTITY });
  const proofBundle = buildAjnaProofBundle({
    ...ALL_READY_BUNDLE_INPUT,
    ajnaMatrixStatus: 'AJNA_PROOF_BLOCKED',
  });
  const riskSynthesis = synthesizeAjnaRisk({ proofBundle });
  const mergeDecision = buildAjnaMergeDecision({ proofBundle, riskSynthesis });
  return composeAjnaReviewReport({
    session,
    proofBundle,
    riskSynthesis,
    mergeDecision,
    format,
  });
}

function buildOperatorReport(format: 'plain' | 'markdown' | 'compact') {
  const session = buildAjnaReviewSession({ identity: IDENTITY });
  const proofBundle = buildAjnaProofBundle(ALL_READY_BUNDLE_INPUT);
  const riskSynthesis = synthesizeAjnaRisk({ proofBundle, protectedFileCount: 2 });
  const mergeDecision = buildAjnaMergeDecision({ proofBundle, riskSynthesis });
  return composeAjnaReviewReport({
    session,
    proofBundle,
    riskSynthesis,
    mergeDecision,
    format,
  });
}

describe('Ajna Review Report Composer', () => {
  it('emits canonical metadata', () => {
    const report = buildReadyReport('plain');

    expect(report.blockId).toBe(AJNA_REVIEW_REPORT_COMPOSER_BLOCK_ID);
    expect(report.prId).toBe(AJNA_REVIEW_REPORT_COMPOSER_PR_ID);
    expect(report.phaseId).toBe(AJNA_REVIEW_REPORT_COMPOSER_PHASE_ID);
  });

  it('renders merge-ready report in plain format', () => {
    const report = buildReadyReport('plain');

    expect(report.format).toBe('plain');
    expect(report.text).toContain('JLPARTIN/JLPARTIN-CodeMind');
    expect(report.text).toContain('#35');
    expect(report.text).toContain('MERGE_READY');
    expect(report.text).toContain('PROOF_GATE_OPEN');
    expect(report.text).toContain('LOW');
    expect(report.lineCount).toBeGreaterThan(0);
  });

  it('renders blocked report in plain format', () => {
    const report = buildBlockedReport('plain');

    expect(report.text).toContain('BLOCKED');
    expect(report.text).toContain('ajnaMatrix');
  });

  it('renders operator-review report in plain format', () => {
    const report = buildOperatorReport('plain');

    expect(report.text).toContain('NEEDS_OPERATOR_REVIEW');
    expect(report.text).toContain('HIGH');
  });

  it('renders in markdown format with ## heading', () => {
    const report = buildReadyReport('markdown');

    expect(report.format).toBe('markdown');
    expect(report.text).toContain('## Ajna Review');
    expect(report.text).toContain('```bash');
    expect(report.text).toContain('MERGE_READY');
  });

  it('renders blocked report in markdown format', () => {
    const report = buildBlockedReport('markdown');

    expect(report.text).toContain('## Ajna Review');
    expect(report.text).toContain('BLOCKED');
  });

  it('renders in compact format as single line', () => {
    const report = buildReadyReport('compact');

    expect(report.format).toBe('compact');
    expect(report.lineCount).toBe(1);
    expect(report.text).toContain('[MERGE_READY]');
    expect(report.text).toContain('JLPARTIN/JLPARTIN-CodeMind#35');
  });

  it('includes canonical lineage in plain output', () => {
    const report = buildReadyReport('plain');

    expect(report.text).toContain(IDENTITY.headSha);
    expect(report.text).toContain(IDENTITY.baseSha);
  });

  it('includes proof domain summary', () => {
    const report = buildBlockedReport('plain');

    expect(report.text).toContain('Proof Bundle');
    expect(report.text).toContain('Blocked:');
  });

  it('includes deterministic reason order', () => {
    const r1 = buildReadyReport('plain');
    const r2 = buildReadyReport('plain');

    expect(r1.text).toBe(r2.text);
    expect(r1.lineCount).toBe(r2.lineCount);
  });

  it('does not include timestamps unless renderedAt is supplied', () => {
    const withTs = composeAjnaReviewReport({
      session: buildAjnaReviewSession({ identity: IDENTITY }),
      proofBundle: buildAjnaProofBundle(ALL_READY_BUNDLE_INPUT),
      riskSynthesis: synthesizeAjnaRisk({
        proofBundle: buildAjnaProofBundle(ALL_READY_BUNDLE_INPUT),
      }),
      mergeDecision: buildAjnaMergeDecision({
        proofBundle: buildAjnaProofBundle(ALL_READY_BUNDLE_INPUT),
        riskSynthesis: synthesizeAjnaRisk({
          proofBundle: buildAjnaProofBundle(ALL_READY_BUNDLE_INPUT),
        }),
      }),
      format: 'plain',
      renderedAt: '2026-05-29T00:00:00.000Z',
    });
    const withoutTs = buildReadyReport('plain');

    expect(withTs.text).toContain('2026-05-29T00:00:00.000Z');
    expect(withoutTs.text).not.toContain('Rendered:');
  });

  it('renders missing-proof report', () => {
    const session = buildAjnaReviewSession({ identity: IDENTITY });
    const proofBundle = buildAjnaProofBundle({});
    const riskSynthesis = synthesizeAjnaRisk({ proofBundle });
    const mergeDecision = buildAjnaMergeDecision({ proofBundle, riskSynthesis });
    const report = composeAjnaReviewReport({
      session, proofBundle, riskSynthesis, mergeDecision, format: 'plain',
    });

    expect(report.text).toContain('Missing:');
    expect(report.text).toContain('BLOCKED');
  });

  it('keeps mutation flags false', () => {
    const report = buildReadyReport('plain');

    expect(report.mutationAllowed).toBe(false);
    expect(report.githubWriteAllowed).toBe(false);
    expect(report.providerInvocationAllowed).toBe(false);
  });
});
