import { AJNA_GOVERNANCE_RULES } from './ajna-rules.js';
import type { AjnaGovernanceRule } from './ajna-rules.js';
import type { AjnaReviewPanelViewModel } from '../ui/ajna-ui.types.js';

export interface AjnaRuleEvaluationResult {
  readonly id: string;
  readonly description: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface AjnaRuleEvaluationReport {
  readonly allPassed: boolean;
  readonly results: readonly AjnaRuleEvaluationResult[];
}

export function evaluateAjnaRules(
  review: AjnaReviewPanelViewModel,
  rules: readonly AjnaGovernanceRule[] = AJNA_GOVERNANCE_RULES,
): AjnaRuleEvaluationReport {
  const results = rules.map((rule) => {
    const outcome = rule.evaluate(review);

    return {
      id: rule.id,
      description: rule.description,
      passed: outcome.passed,
      detail: outcome.detail,
    };
  });

  return {
    allPassed: results.every((result) => result.passed),
    results,
  };
}
