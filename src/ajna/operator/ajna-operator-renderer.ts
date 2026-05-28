import type { AjnaReviewComparisonReport } from './ajna-review-compare.js';
import type { AjnaRiskTrendPoint } from './ajna-risk-trend.js';

export interface AjnaComparisonSummaryView {
  readonly leftRuling: string;
  readonly rightRuling: string;
  readonly confidenceDelta: number;
  readonly addedLanes: readonly string[];
  readonly removedLanes: readonly string[];
  readonly fileDriftCount: number;
  readonly ci: AjnaReviewComparisonReport['ci'];
}

export interface AjnaRiskTrendSummaryView {
  readonly firstScore: number;
  readonly latestScore: number;
  readonly scoreDelta: number;
  readonly points: readonly AjnaRiskTrendPoint[];
}

export function renderAjnaComparisonSummary(
  report: AjnaReviewComparisonReport,
): AjnaComparisonSummaryView {
  return {
    leftRuling: report.readiness.left.ruling,
    rightRuling: report.readiness.right.ruling,
    confidenceDelta: report.readiness.confidenceDelta,
    addedLanes: report.lanes.added,
    removedLanes: report.lanes.removed,
    fileDriftCount: report.files.length,
    ci: report.ci,
  };
}

export function renderAjnaRiskTrendSummary(
  trend: readonly AjnaRiskTrendPoint[],
): AjnaRiskTrendSummaryView {
  const firstScore = trend[0]?.score ?? 0;
  const latestScore = trend[trend.length - 1]?.score ?? 0;

  return {
    firstScore,
    latestScore,
    scoreDelta: latestScore - firstScore,
    points: trend,
  };
}
