import { describe, expect, it } from 'vitest'

import { renderAjnaReviewPanelMarkdown } from './ajna-ui-renderer.js'
import type { AjnaReviewPanelViewModel } from './ajna-ui.types.js'

function makeViewModel(): AjnaReviewPanelViewModel {
  return {
    repository: 'JLPARTIN/JLPARTIN-CodeMind',
    pullRequestNumber: 12,
    readiness: {
      ruling: 'NEEDS_OPERATOR_DECISION',
      confidence: 0.86,
      summary: 'Review needs operator confirmation.',
      operatorDecisionRequired: true,
    },
    timeline: [
      {
        label: 'Scope Loaded',
        detail: '2 changed file(s) loaded for review.',
        status: 'INFO',
      },
      {
        label: 'Readiness Decision',
        detail: 'NEEDS_OPERATOR_DECISION',
        status: 'WARN',
      },
    ],
    riskLanes: [
      {
        lane: 'ci',
        count: 1,
        severity: 'HIGH',
      },
      {
        lane: 'tests',
        count: 2,
        severity: 'MEDIUM',
      },
    ],
    fileInsights: [
      {
        path: '.github/workflows/ci.yml',
        lane: 'ci',
        additions: 12,
        deletions: 2,
        totalDelta: 14,
        score: 6,
        severity: 'CRITICAL',
        flags: {
          largeDelta: false,
          protectedPath: true,
          configurationRisk: true,
          testOnlySignal: false,
        },
      },
    ],
    ciSummary: {
      total: 4,
      successful: 3,
      failed: 0,
      pending: 1,
      neutral: 0,
      healthy: false,
    },
    commentPreview: {
      enabled: false,
      markdown: '# Ajna Review\n\nPreview only.',
      dryRun: true,
    },
  }
}

describe('Ajna UI renderer', () => {
  it('renders the review panel markdown', () => {
    const markdown = renderAjnaReviewPanelMarkdown(makeViewModel())

    expect(markdown).toContain('# CodeMind — Ajna Review Panel')
    expect(markdown).toContain('**Repository:** JLPARTIN/JLPARTIN-CodeMind')
    expect(markdown).toContain('**Ruling:** NEEDS_OPERATOR_DECISION')
    expect(markdown).toContain('**Confidence:** 86.0%')
    expect(markdown).toContain('**Scope Loaded:** 2 changed file(s) loaded for review. (INFO)')
    expect(markdown).toContain('**ci:** 1 file(s), severity HIGH')
    expect(markdown).toContain('**tests:** 2 file(s), severity MEDIUM')
    expect(markdown).toContain('**.github/workflows/ci.yml**')
    expect(markdown).toContain('Severity: CRITICAL')
    expect(markdown).toContain('**Healthy:** No')
    expect(markdown).toContain('**Dry run:** Yes')
    expect(markdown).toContain('Preview only.')
  })

  it('renders empty optional sections safely', () => {
    const base = makeViewModel()
    const model: AjnaReviewPanelViewModel = {
      repository: base.repository,
      readiness: base.readiness,
      riskLanes: [],
      commentPreview: base.commentPreview,
    }
    const markdown = renderAjnaReviewPanelMarkdown(model)

    expect(markdown).toContain('No timeline available.')
    expect(markdown).toContain('No risk lanes detected.')
    expect(markdown).toContain('No file insights available.')
    expect(markdown).toContain('No CI data available.')
    expect(markdown).toContain('**Pull request:** Not provided')
  })
})
