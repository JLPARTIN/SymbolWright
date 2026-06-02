import { describe, expect, it } from 'vitest'

import {
  renderAjnaComparisonSummary,
  renderAjnaRiskTrendSummary,
} from './ajna-operator-renderer.js'
import type { AjnaReviewComparisonReport } from './ajna-review-compare.js'
import type { AjnaRiskTrendPoint } from './ajna-risk-trend.js'

describe('Ajna operator renderer', () => {
  it('renders a compact comparison summary', () => {
    const report: AjnaReviewComparisonReport = {
      readiness: {
        left: {
          ruling: 'READY_TO_REVIEW',
          confidence: 0.7,
          summary: 'Ready.',
          operatorDecisionRequired: false,
        },
        right: {
          ruling: 'BLOCKED_BY_CI',
          confidence: 0.9,
          summary: 'Blocked.',
          operatorDecisionRequired: true,
        },
        confidenceDelta: 0.2,
        rulingChanged: true,
      },
      lanes: {
        added: ['ci'],
        removed: ['tests'],
        unchanged: [],
      },
      files: [
        {
          path: 'src/index.ts',
          type: 'MODIFIED',
          scoreDelta: 2,
        },
      ],
      ci: {
        successfulDelta: 1,
        failedDelta: -1,
        pendingDelta: 0,
        neutralDelta: 0,
        healthChanged: true,
      },
    }

    const summary = renderAjnaComparisonSummary(report)

    expect(summary.leftRuling).toBe('READY_TO_REVIEW')
    expect(summary.rightRuling).toBe('BLOCKED_BY_CI')
    expect(summary.addedLanes).toEqual(['ci'])
    expect(summary.fileDriftCount).toBe(1)
  })

  it('renders risk trend summary deltas', () => {
    const trend: readonly AjnaRiskTrendPoint[] = [
      {
        id: 'first',
        savedAt: '2026-05-28T00:00:00.000Z',
        score: 2,
        ruling: 'READY_TO_REVIEW',
      },
      {
        id: 'latest',
        savedAt: '2026-05-28T00:05:00.000Z',
        score: 8,
        ruling: 'BLOCKED_BY_CI',
      },
    ]

    const summary = renderAjnaRiskTrendSummary(trend)

    expect(summary.firstScore).toBe(2)
    expect(summary.latestScore).toBe(8)
    expect(summary.scoreDelta).toBe(6)
    expect(summary.points).toBe(trend)
  })
})
