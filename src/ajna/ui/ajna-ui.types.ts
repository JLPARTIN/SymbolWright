export const AJNA_UI_READINESS_RULINGS = [
  'READY_TO_REVIEW',
  'NEEDS_TEST_EVIDENCE',
  'NEEDS_OPERATOR_DECISION',
  'BLOCKED_BY_RISK',
  'BLOCKED_BY_CI',
  'BLOCKED_BY_SECURITY',
  'BLOCKED_BY_ARCHITECTURE_DRIFT',
  'MERGE_READY_WITH_EVIDENCE',
] as const;
export type AjnaUiReadinessRuling =
  (typeof AJNA_UI_READINESS_RULINGS)[number];

export const AJNA_UI_RISK_LANES = [
  'docs',
  'tests',
  'ui',
  'auth',
  'security',
  'database',
  'ci',
  'dependencies',
  'infrastructure',
  'unknown',
] as const;
export type AjnaUiRiskLane = (typeof AJNA_UI_RISK_LANES)[number];

export interface AjnaUiReadinessViewModel {
  readonly ruling: AjnaUiReadinessRuling;
  readonly confidence: number;
  readonly summary: string;
  readonly operatorDecisionRequired: boolean;
}

export interface AjnaUiRiskLaneViewModel {
  readonly lane: AjnaUiRiskLane;
  readonly count: number;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
}

export interface AjnaUiCiSummaryViewModel {
  readonly total: number;
  readonly successful: number;
  readonly failed: number;
  readonly pending: number;
  readonly neutral: number;
  readonly healthy: boolean;
}

export interface AjnaUiDryRunCommentPreview {
  readonly enabled: boolean;
  readonly markdown: string;
  readonly dryRun: boolean;
}

export interface AjnaUiTimelineStepViewModel {
  readonly label: string;
  readonly detail: string;
  readonly status: 'INFO' | 'PASS' | 'WARN' | 'BLOCKED';
}

export interface AjnaUiFileInsightFlagsViewModel {
  readonly largeDelta: boolean;
  readonly protectedPath: boolean;
  readonly configurationRisk: boolean;
  readonly testOnlySignal: boolean;
}

export interface AjnaUiFileInsightViewModel {
  readonly path: string;
  readonly lane: AjnaUiRiskLane;
  readonly additions: number;
  readonly deletions: number;
  readonly totalDelta: number;
  readonly score: number;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
  readonly flags: AjnaUiFileInsightFlagsViewModel;
}

export interface AjnaReviewPanelViewModel {
  readonly repository: string;
  readonly pullRequestNumber?: number;
  readonly readiness: AjnaUiReadinessViewModel;
  readonly riskLanes: readonly AjnaUiRiskLaneViewModel[];
  readonly ciSummary?: AjnaUiCiSummaryViewModel;
  readonly commentPreview: AjnaUiDryRunCommentPreview;
  readonly timeline?: readonly AjnaUiTimelineStepViewModel[];
  readonly fileInsights?: readonly AjnaUiFileInsightViewModel[];
}
