import { describe, expect, it } from 'vitest'

import { createZflowReportCatalog } from './zflow-report-catalog.js'
import type { ZflowExecutionReport } from './zflow-report.js'
import {
  createZflowReportSuite,
  renderZflowReportSuiteJson,
  renderZflowReportSuiteMarkdown,
} from './zflow-report-suite.js'

function makeReport(
  id: string,
  readiness: 'READY_FOR_OPERATOR_REVIEW' | 'NEEDS_RECOVERY_DETAIL' | 'BLOCKED',
): ZflowExecutionReport {
  return {
    id,
    generatedAt: '2026-01-01T00:00:00.000Z',
    result: {
      mode: 'prepare-pr',
      localOutput: readiness === 'BLOCKED' ? 'blocked' : 'completed',
      prOutput: 'CodeMind GitHub PR creation\n\nOutcome: DRY_RUN',
      collaborationOutput: 'CodeMind PR collaboration\n\nOutcome: DRY_RUN',
      recoveryOutput: 'CodeMind recovery change ledger\n\nChanges: 1',
      rollbackOutput: 'Rollback plan: Recover Zflow preview\n\n1. src/generated.ts',
    },
    readiness: {
      readiness,
      reasons: ['Ready for operator review.'],
    },
    sections: [],
  }
}

describe('zflow report suite', () => {
  it('creates a ready rollup for ready reports', () => {
    const catalog = createZflowReportCatalog({
      title: 'Zflow Reports',
      reports: [makeReport('report-1', 'READY_FOR_OPERATOR_REVIEW')],
      generatedAt: '2026-01-01T00:00:00.000Z',
    })
    const suite = createZflowReportSuite({
      title: 'Zflow Suite',
      catalog,
      generatedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(suite.rollup.readiness).toBe('READY')
    expect(suite.rollup.reportCount).toBe(1)
    expect(suite.rollup.artifactCount).toBe(2)
  })

  it('detects blocked reports in the rollup', () => {
    const catalog = createZflowReportCatalog({
      title: 'Zflow Reports',
      reports: [
        makeReport('report-1', 'READY_FOR_OPERATOR_REVIEW'),
        makeReport('report-2', 'BLOCKED'),
      ],
    })
    const suite = createZflowReportSuite({ title: 'Zflow Suite', catalog })

    expect(suite.rollup.readiness).toBe('BLOCKED')
    expect(suite.rollup.blockedCount).toBe(1)
  })

  it('renders markdown suite output', () => {
    const catalog = createZflowReportCatalog({
      title: 'Zflow Reports',
      reports: [makeReport('report-1', 'READY_FOR_OPERATOR_REVIEW')],
      generatedAt: '2026-01-01T00:00:00.000Z',
    })
    const suite = createZflowReportSuite({
      title: 'Zflow Suite',
      catalog,
      generatedAt: '2026-01-01T00:00:00.000Z',
    })
    const output = renderZflowReportSuiteMarkdown(suite)

    expect(output).toContain('# Zflow Suite')
    expect(output).toContain('Readiness: READY')
    expect(output).toContain('Suite output is report-only.')
  })

  it('renders json suite output', () => {
    const catalog = createZflowReportCatalog({
      title: 'Zflow Reports',
      reports: [makeReport('report-1', 'READY_FOR_OPERATOR_REVIEW')],
    })
    const suite = createZflowReportSuite({ title: 'Zflow Suite', catalog })
    const parsed = JSON.parse(renderZflowReportSuiteJson(suite)) as {
      readonly rollup: { readonly readiness: string }
      readonly manifest: { readonly artifactCount: number }
    }

    expect(parsed.rollup.readiness).toBe('READY')
    expect(parsed.manifest.artifactCount).toBe(2)
  })
})
