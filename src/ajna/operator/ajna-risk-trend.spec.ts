import { describe, expect, it } from 'vitest'

import { buildAjnaRiskTrend } from './ajna-risk-trend.js'
import { createAjnaSavedReviewRecord } from './ajna-saved-reviews.js'
import type { AjnaReviewPanelViewModel } from '../ui/ajna-ui.types.js'

function makeReview(
  ruling: AjnaReviewPanelViewModel['readiness']['ruling'],
  fileScore: number,
): AjnaReviewPanelViewModel {
  return {
    repository: 'owner/repo',
    pullRequestNumber: 14,
    readiness: {
      ruling,
      confidence: 0.8,
      summary: 'Review summary.',
      operatorDecisionRequired: ruling.startsWith('BLOCKED'),
    },
    riskLanes: [],
    fileInsights: [
      {
        path: 'src/index.ts',
        lane: 'unknown',
        additions: 10,
        deletions: 2,
        totalDelta: 12,
        score: fileScore,
        severity: 'MEDIUM',
        flags: {
          largeDelta: false,
          protectedPath: false,
          configurationRisk: false,
          testOnlySignal: false,
        },
      },
    ],
    ciSummary: {
      total: 2,
      successful: 1,
      failed: 1,
      pending: 1,
      neutral: 0,
      healthy: false,
    },
    commentPreview: {
      enabled: false,
      markdown: 'Preview',
      dryRun: true,
    },
  }
}

describe('Ajna risk trend', () => {
  it('sorts saved reviews and computes risk trend points', () => {
    const records = [
      createAjnaSavedReviewRecord({
        id: 'late',
        savedAt: '2026-05-28T00:02:00.000Z',
        review: makeReview('BLOCKED_BY_CI', 4),
      }),
      createAjnaSavedReviewRecord({
        id: 'early',
        savedAt: '2026-05-28T00:01:00.000Z',
        review: makeReview('READY_TO_REVIEW', 1),
      }),
    ]

    const trend = buildAjnaRiskTrend(records)

    expect(trend.map((point) => point.id)).toEqual(['early', 'late'])
    expect(trend[0]?.score).toBe(5)
    expect(trend[1]?.score).toBe(13)
  })
})
