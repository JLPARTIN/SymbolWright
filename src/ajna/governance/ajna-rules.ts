import type { AjnaReviewPanelViewModel } from '../ui/ajna-ui.types.js';

export interface AjnaRuleOutcome {
  readonly passed: boolean;
  readonly detail: string;
}

export interface AjnaGovernanceRule {
  readonly id: string;
  readonly description: string;
  readonly evaluate: (review: AjnaReviewPanelViewModel) => AjnaRuleOutcome;
}

export const AJNA_GOVERNANCE_RULES: readonly AjnaGovernanceRule[] = [
  {
    id: 'ci.no-failures',
    description: 'CI must have zero failing checks.',
    evaluate(review) {
      const failed = review.ciSummary?.failed ?? 0;

      return {
        passed: failed === 0,
        detail:
          failed === 0
            ? 'No failing CI checks.'
            : `${failed} failing CI check(s) detected.`,
      };
    },
  },
  {
    id: 'risk.no-critical-files',
    description: 'No file may have critical risk severity.',
    evaluate(review) {
      const offenders = (review.fileInsights ?? []).filter(
        (file) => file.severity === 'CRITICAL' || file.score > 5,
      );

      return {
        passed: offenders.length === 0,
        detail:
          offenders.length === 0
            ? 'No critical file risk detected.'
            : `Critical file risk: ${offenders.map((file) => file.path).join(', ')}`,
      };
    },
  },
  {
    id: 'readiness.min-confidence',
    description: 'Readiness confidence must be at least 0.70.',
    evaluate(review) {
      const confidence = review.readiness.confidence;

      return {
        passed: confidence >= 0.7,
        detail: `Confidence = ${confidence.toFixed(2)}`,
      };
    },
  },
];
