import { describe, expect, it } from 'vitest'

import { buildAjnaReviewComparisonReport } from './ajna-review-compare.js'
import type { AjnaReviewPanelViewModel } from '../ui/ajna-ui.types.js'

function makeReview(overrides: Partial<AjnaReviewPanelViewModel> = {}): AjnaReviewPanelViewModel {
  return {
    repository: 'owner/repo',
    pullRequestNumber: 14,
    readiness: {
      ruling: 'READY_TO_REVIEW',
      confidence: 0.7,
      summary: 'Ready.',
      operatorDecisionRequired: false,
    },
    riskLanes: [
      {
        lane: 'tests',
        count: 1,
        severity: 'LOW',
      },
    ],
    fileInsights: [
      {
        path: 'a.ts',
        lane: 'tests',
        additions: 10,
        deletions: 0,
        totalDelta: 10,
        score: 1,
        severity: 'LOW',
        flags: {
          largeDelta: false,
          protectedPath: false,
          configurationRisk: false,
          testOnlySignal: true,
        },
      },
    ],
    ciSummary: {
      total: 2,
      successful: 1,
      failed: 1,
      pending: 0,
      neutral: 0,
      healthy: false,
    },
    commentPreview: {
      enabled: false,
      markdown: 'Preview',
      dryRun: true,
    },
    ...overrides,
  }
}

describe('Ajna review comparison', () => {
  it('computes readiness, lane, file, and CI drift', () => {
    const report = buildAjnaReviewComparisonReport(
      makeReview(),
      makeReview({
        readiness: {
          ruling: 'BLOCKED_BY_SECURITY',
          confidence: 0.9,
          summary: 'Blocked.',
          operatorDecisionRequired: true,
        },
        riskLanes: [
          {
            lane: 'security',
            count: 1,
            severity: 'HIGH',
          },
        ],
        fileInsights: [
          {
            path: 'a.ts',
            lane: 'security',
            additions: 20,
            deletions: 2,
            totalDelta: 22,
            score: 4,
            severity: 'HIGH',
            flags: {
              largeDelta: false,
              protectedPath: false,
              configurationRisk: false,
              testOnlySignal: false,
            },
          },
          {
            path: 'c.ts',
            lane: 'security',
            additions: 50,
            deletions: 0,
            totalDelta: 50,
            score: 3,
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
          total: 3,
          successful: 3,
          failed: 0,
          pending: 0,
          neutral: 0,
          healthy: true,
        },
      }),
    )

    expect(report.readiness.confidenceDelta).toBe(0.2)
    expect(report.readiness.rulingChanged).toBe(true)
    expect(report.lanes.added).toEqual(['security'])
    expect(report.lanes.removed).toEqual(['tests'])
    expect(report.files).toHaveLength(2)
    expect(report.ci.successfulDelta).toBe(2)
    expect(report.ci.failedDelta).toBe(-1)
    expect(report.ci.healthChanged).toBe(true)
  })
})
