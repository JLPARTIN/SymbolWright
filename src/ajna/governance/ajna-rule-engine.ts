import { AJNA_GOVERNANCE_RULES } from './ajna-rule-catalog.js'
import type { AjnaGovernanceRule, AjnaRuleEvaluationReport } from './ajna-rule-types.js'
import type { AjnaReviewPanelViewModel } from '../ui/ajna-ui.types.js'

export function evaluateAjnaGovernanceRules(
  review: AjnaReviewPanelViewModel,
  rules: readonly AjnaGovernanceRule[] = AJNA_GOVERNANCE_RULES,
): AjnaRuleEvaluationReport {
  const results = rules.map((rule) => {
    const outcome = rule.evaluate(review)
    return {
      id: rule.id,
      description: rule.description,
      passed: outcome.passed,
      detail: outcome.detail,
    }
  })

  return {
    allPassed: results.every((result) => result.passed),
    results,
  }
}
