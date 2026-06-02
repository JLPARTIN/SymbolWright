import type { AjnaReviewPanelViewModel } from '../ui/ajna-ui.types.js'

export interface AjnaRuleOutcome {
  readonly passed: boolean
  readonly detail: string
}

export interface AjnaGovernanceRule {
  readonly id: string
  readonly description: string
  readonly evaluate: (review: AjnaReviewPanelViewModel) => AjnaRuleOutcome
}

export interface AjnaRuleEvaluationResult {
  readonly id: string
  readonly description: string
  readonly passed: boolean
  readonly detail: string
}

export interface AjnaRuleEvaluationReport {
  readonly allPassed: boolean
  readonly results: readonly AjnaRuleEvaluationResult[]
}
