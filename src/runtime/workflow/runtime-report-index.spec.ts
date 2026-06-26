import { describe, expect, it } from 'vitest'

import { createZflowReportCatalog, createZflowReportArtifactManifest } from './zflow-report-catalog.js'
import type { ZflowExecutionReport } from './zflow-report.js'
import { createZflowReportSuite } from './zflow-report-suite.js'
import {
  createRuntimeReportIndex,
  renderRuntimeReportIndexJson,
  renderRuntimeReportIndexMarkdown,
} from './runtime-report-index.js'

function makeReport(id: string, readiness: 'READY_FOR_OPERATOR_REVIEW' | 'NEEDS_RECOVERY_DETAIL' | 'BLOCKED'): ZflowExecutionReport {
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

describe('runtime report index', () => {
  it('summarizes reports, catalog, manifest, and suite', () => {
    const reports = [makeReport('report-1', 'READY_FOR_OPERATOR_REVIEW')]
    const catalog = createZflowReportCatalog({ title: 'Zflow Reports', reports })
    const manifest = createZflowReportArtifactManifest(catalog)
    const suite = createZflowReportSuite({ title: 'Zflow Suite', catalog })
    const index = createRuntimeReportIndex({
      title: 'Runtime Report Index',
      reports,
      catalog,
      manifest,
      suite,
      generatedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(index.summary.status).toBe('READY')
    expect(index.summary.entryCount).toBe(4)
    expect(index.entries.map((entry) => entry.kind)).toEqual(['report', 'catalog', 'manifest', 'suite'])
  })

  it('rolls blocked status up to the index', () => {
    const reports = [makeReport('report-1', 'READY_FOR_OPERATOR_REVIEW'), makeReport('report-2', 'BLOCKED')]
    const index = createRuntimeReportIndex({ title: 'Runtime Report Index', reports })

    expect(index.summary.status).toBe('BLOCKED')
    expect(index.summary.blockedCount).toBe(1)
  })

  it('renders markdown with build-state summary and links', () => {
    const reports = [makeReport('report-1', 'READY_FOR_OPERATOR_REVIEW')]
    const index = createRuntimeReportIndex({
      title: 'Runtime Report Index',
      reports,
      generatedAt: '2026-01-01T00:00:00.000Z',
    })
    const output = renderRuntimeReportIndexMarkdown(index)

    expect(output).toContain('# Runtime Report Index')
    expect(output).toContain('## Build-state summary')
    expect(output).toContain('report:report-1:markdown')
    expect(output).toContain('Report index output is read-only.')
  })

  it('renders json output', () => {
    const index = createRuntimeReportIndex({
      title: 'Runtime Report Index',
      reports: [makeReport('report-1', 'READY_FOR_OPERATOR_REVIEW')],
    })
    const parsed = JSON.parse(renderRuntimeReportIndexJson(index)) as {
      readonly summary: { readonly status: string }
      readonly entries: readonly unknown[]
    }

    expect(parsed.summary.status).toBe('READY')
    expect(parsed.entries).toHaveLength(1)
  })
})
