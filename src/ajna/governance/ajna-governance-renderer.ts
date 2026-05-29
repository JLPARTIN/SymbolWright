import { getAjnaOverridesForRule } from './ajna-overrides.js';
import type { AjnaGovernanceOverrideRecord } from './ajna-overrides.js';
import type {
  AjnaRuleEvaluationReport,
  AjnaRuleEvaluationResult,
} from './ajna-rule-types.js';

export interface AjnaRenderedGovernanceOverride {
  readonly id: string;
  readonly createdAt: string;
  readonly justification: string;
  readonly operatorId?: string;
}

export interface AjnaRenderedGovernanceRuleResult {
  readonly id: string;
  readonly description: string;
  readonly passed: boolean;
  readonly detail: string;
  readonly overridden: boolean;
  readonly overrides: readonly AjnaRenderedGovernanceOverride[];
}

export interface AjnaRenderedGovernanceReport {
  readonly allPassed: boolean;
  readonly totalRules: number;
  readonly passedRules: number;
  readonly failedRules: number;
  readonly results: readonly AjnaRenderedGovernanceRuleResult[];
}

function renderOverride(
  override: AjnaGovernanceOverrideRecord,
): AjnaRenderedGovernanceOverride {
  const base = {
    id: override.id,
    createdAt: override.createdAt,
    justification: override.justification,
  };

  if (override.operatorId) {
    return {
      ...base,
      operatorId: override.operatorId,
    };
  }

  return base;
}

function renderRuleResult(
  result: AjnaRuleEvaluationResult,
  overrides: readonly AjnaGovernanceOverrideRecord[],
): AjnaRenderedGovernanceRuleResult {
  const matchingOverrides = getAjnaOverridesForRule(overrides, result.id);

  return {
    id: result.id,
    description: result.description,
    passed: result.passed,
    detail: result.detail,
    overridden: matchingOverrides.length > 0,
    overrides: matchingOverrides.map((override) => renderOverride(override)),
  };
}

export function renderAjnaGovernanceReport(
  report: AjnaRuleEvaluationReport,
  overrides: readonly AjnaGovernanceOverrideRecord[] = [],
): AjnaRenderedGovernanceReport {
  const passedRules = report.results.filter((result) => result.passed).length;
  const totalRules = report.results.length;

  return {
    allPassed: report.allPassed,
    totalRules,
    passedRules,
    failedRules: totalRules - passedRules,
    results: report.results.map((result) => renderRuleResult(result, overrides)),
  };
}
