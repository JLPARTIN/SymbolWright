import { describe, expect, it } from 'vitest';

import { renderAjnaReviewReport } from './ajna-review-renderer.js';
import type { AjnaReviewResponse } from './ajna-review.types.js';

function makeResponse(overrides: Partial<AjnaReviewResponse> = {}): AjnaReviewResponse {
  return {
    requestId: 'ajna-report-1',
    subject: {
      repository: 'JLPARTIN/JLPARTIN-CodeMind',
      pullRequestNumber: 6,
      baseRef: 'main',
      headRef: 'pr6-ajna-review-report-renderer',
    },
    tagline: 'See beyond the code.',
    subtitle: 'Expand your vision beyond the diff.',
    findings: [
      {
        id: 'finding-1',
        category: 'SECURITY_SENSITIVE_CHANGE',
        risk: 'CRITICAL',
        title: 'Workflow security-sensitive change',
        summary: 'The workflow path changed and should receive operator review.',
        evidence: [
          {
            evidenceClass: 'DIRECT_DIFF_EVIDENCE',
            summary: '.github/workflows/ci.yml changed.',
            sourcePath: '.github/workflows/ci.yml',
          },
        ],
        affectedFiles: ['.github/workflows/ci.yml'],
        recommendation: 'Review the workflow diff before merge.',
        blocksMerge: true,
      },
    ],
    mergeReadiness: {
      status: 'BLOCKED_BY_SECURITY',
      summary: 'Security-sensitive changes require review before merge.',
      requiredEvidencePresent: false,
      blockingFindings: ['finding-1'],
      operatorDecisionRequired: true,
    },
    recommendedNextAction: 'Resolve or approve the security-sensitive workflow change.',
    ...overrides,
  };
}

describe('Ajna review report renderer', () => {
  it('renders a deterministic markdown report with core sections', () => {
    const report = renderAjnaReviewReport(makeResponse());

    expect(report).toContain('# Ajna Review Cortex Report');
    expect(report).toContain('> See beyond the code.');
    expect(report).toContain('> Expand your vision beyond the diff.');
    expect(report).toContain('## Summary');
    expect(report).toContain('## Files Changed / Affected');
    expect(report).toContain('## Risk Map');
    expect(report).toContain('## Evidence');
    expect(report).toContain('## Architecture Impact');
    expect(report).toContain('## Security Notes');
    expect(report).toContain('## Merge-Readiness');
    expect(report).toContain('## Recommended Next Action');
  });

  it('includes merge-readiness without declaring merge authority', () => {
    const report = renderAjnaReviewReport(makeResponse());

    expect(report).toContain('- **Status:** BLOCKED_BY_SECURITY');
    expect(report).toContain('- **Operator decision required:** Yes');
    expect(report).not.toContain('Approved to merge');
  });

  it('renders empty findings safely', () => {
    const report = renderAjnaReviewReport(
      makeResponse({
        findings: [],
        mergeReadiness: {
          status: 'READY_TO_REVIEW',
          summary: 'No findings reported.',
          requiredEvidencePresent: false,
          blockingFindings: [],
          operatorDecisionRequired: false,
        },
        recommendedNextAction: 'Continue review.',
      }),
    );

    expect(report).toContain('- No findings reported.');
    expect(report).toContain('- **Blocking findings:** 0');
    expect(report).toContain('- **Status:** READY_TO_REVIEW');
  });
});
