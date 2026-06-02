import { describe, expect, it } from 'vitest'

import { renderAjnaGovernanceReport } from './ajna-governance-renderer.js'
import { createAjnaGovernanceOverride } from './ajna-overrides.js'
import type { AjnaRuleEvaluationReport } from './ajna-rule-types.js'

describe('Ajna governance renderer', () => {
  it('renders rule report totals and override summaries', () => {
    const report: AjnaRuleEvaluationReport = {
      allPassed: false,
      results: [
        {
          id: 'ci.zero-failed-checks',
          description: 'CI summary should report zero failed checks.',
          passed: false,
          detail: 'CI failed checks: 1',
        },
        {
          id: 'readiness.minimum-confidence',
          description: 'Readiness confidence should be at least 0.70.',
          passed: true,
          detail: 'Readiness confidence: 0.80',
        },
      ],
    }
    const override = createAjnaGovernanceOverride({
      id: 'override-1',
      createdAt: '2026-05-28T00:00:00.000Z',
      ruleId: 'ci.zero-failed-checks',
      justification: 'Known transient check issue reviewed by operator.',
      operatorId: 'operator-1',
    })

    const rendered = renderAjnaGovernanceReport(report, [override])

    expect(rendered.totalRules).toBe(2)
    expect(rendered.passedRules).toBe(1)
    expect(rendered.failedRules).toBe(1)
    expect(rendered.results[0]?.overridden).toBe(true)
    expect(rendered.results[0]?.overrides[0]?.operatorId).toBe('operator-1')
    expect(rendered.results[1]?.overridden).toBe(false)
  })
})
