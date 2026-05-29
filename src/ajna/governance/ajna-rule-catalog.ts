import type { AjnaGovernanceRule } from './ajna-rule-types.js';

export const AJNA_GOVERNANCE_RULES: readonly AjnaGovernanceRule[] = [
  {
    id: 'ci.zero-failed-checks',
    description: 'CI summary should report zero failed checks.',
    evaluate(review) {
      const failed = review.ciSummary?.failed ?? 0;
      return {
        passed: failed === 0,
        detail: failed === 0 ? 'CI has no failed checks.' : `CI failed checks: ${failed}`,
      };
    },
  },
  {
    id: 'risk.no-critical-file-insights',
    description: 'File insights should not include critical severity entries.',
    evaluate(review) {
      const entries = (review.fileInsights ?? []).filter(
        (file) => file.severity === 'CRITICAL' || file.score > 5,
      );
      return {
        passed: entries.length === 0,
        detail:
          entries.length === 0
            ? 'No critical file insight entries.'
            : `Critical file insight entries: ${entries.map((file) => file.path).join(', ')}`,
      };
    },
  },
  {
    id: 'readiness.minimum-confidence',
    description: 'Readiness confidence should be at least 0.70.',
    evaluate(review) {
      const confidence = review.readiness.confidence;
      return {
        passed: confidence >= 0.7,
        detail: `Readiness confidence: ${confidence.toFixed(2)}`,
      };
    },
  },
];
