import { describe, expect, it } from 'vitest'

import { evaluateAjnaGovernanceRules } from './ajna-rule-engine.js'
import type { AjnaReviewPanelViewModel } from '../ui/ajna-ui.types.js'

function makeReview(overrides: Partial<AjnaReviewPanelViewModel> = {}): AjnaReviewPanelViewModel {
  return {
    repository: 'owner/repo',
    pullRequestNumber: 15,
    readiness: {
      ruling: 'READY_TO_REVIEW',
      confidence: 0.8,
      summary: 'Ready for operator review.',
      operatorDecisionRequired: false,
    },
    riskLanes: [],
    fileInsights: [
      {
        path: 'src/index.ts',
        lane: 'unknown',
        additions: 10,
        deletions: 2,
        totalDelta: 12,
        score: 2,
        severity: 'LOW',
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
      successful: 2,
      failed: 0,
      pending: 0,
      neutral: 0,
      healthy: true,
    },
    commentPreview: {
      enabled: false,
      markdown: 'Preview',
      dryRun: true,
    },
    ...overrides,
  }
}

describe('Ajna governance rule engine', () => {
  it('passes a healthy review through the default rule catalog', () => {
    const report = evaluateAjnaGovernanceRules(makeReview())

    expect(report.allPassed).toBe(true)
    expect(report.results).toHaveLength(3)
    expect(report.results.every((result) => result.passed)).toBe(true)
  })

  it('reports failed rules deterministically', () => {
    const report = evaluateAjnaGovernanceRules(
      makeReview({
        readiness: {
          ruling: 'BLOCKED_BY_CI',
          confidence: 0.5,
          summary: 'Needs attention.',
          operatorDecisionRequired: true,
        },
        ciSummary: {
          total: 2,
          successful: 1,
          failed: 1,
          pending: 0,
          neutral: 0,
          healthy: false,
        },
        fileInsights: [
          {
            path: 'src/critical.ts',
            lane: 'security',
            additions: 300,
            deletions: 20,
            totalDelta: 320,
            score: 7,
            severity: 'CRITICAL',
            flags: {
              largeDelta: true,
              protectedPath: false,
              configurationRisk: false,
              testOnlySignal: false,
            },
          },
        ],
      }),
    )

    expect(report.allPassed).toBe(false)
    expect(report.results.filter((result) => !result.passed)).toHaveLength(3)
    expect(report.results.map((result) => result.id)).toEqual([
      'ci.zero-failed-checks',
      'risk.no-critical-file-insights',
      'readiness.minimum-confidence',
    ])
  })
})
