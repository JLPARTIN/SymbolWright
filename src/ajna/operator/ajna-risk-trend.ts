import type { AjnaSavedReviewRecord } from './ajna-saved-reviews.js';

export interface AjnaRiskTrendPoint {
  readonly id: string;
  readonly savedAt: string;
  readonly score: number;
  readonly ruling: string;
}

function scoreReview(record: AjnaSavedReviewRecord): number {
  const fileInsightScore = (record.review.fileInsights ?? []).reduce(
    (total, insight) => total + insight.score,
    0,
  );
  const failedCiPenalty = record.review.ciSummary
    ? record.review.ciSummary.failed * 3 + record.review.ciSummary.pending
    : 0;
  const readinessPenalty = record.review.readiness.ruling.startsWith('BLOCKED')
    ? 5
    : 0;

  return fileInsightScore + failedCiPenalty + readinessPenalty;
}

export function buildAjnaRiskTrend(
  records: readonly AjnaSavedReviewRecord[],
): readonly AjnaRiskTrendPoint[] {
  return [...records]
    .sort((left, right) => left.savedAt.localeCompare(right.savedAt))
    .map((record) => ({
      id: record.id,
      savedAt: record.savedAt,
      score: scoreReview(record),
      ruling: record.review.readiness.ruling,
    }));
}
