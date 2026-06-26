import { describe, expect, it } from 'vitest'

import { createRuntimeReportIndex } from './runtime-report-index.js'
import { createRuntimeReportReleaseNote } from './runtime-report-release-note.js'
import {
  createRuntimeReportBundleManifest,
  renderRuntimeReportBundleManifestJson,
  renderRuntimeReportBundleManifestMarkdown,
} from './runtime-report-bundle-manifest.js'
import type { ZflowExecutionReport } from './zflow-report.js'

function makeReport(id: string): ZflowExecutionReport {
  return {
    id,
    generatedAt: '2026-01-01T00:00:00.000Z',
    result: {
      mode: 'prepare-pr',
      localOutput: 'completed',
      prOutput: 'CodeMind GitHub PR creation\n\nOutcome: DRY_RUN',
      collaborationOutput: 'CodeMind PR collaboration\n\nOutcome: DRY_RUN',
      recoveryOutput: 'CodeMind recovery change ledger\n\nChanges: 1',
      rollbackOutput: 'Rollback plan: Recover Zflow preview\n\n1. src/generated.ts',
    },
    readiness: {
      readiness: 'READY_FOR_OPERATOR_REVIEW',
      reasons: ['Ready for operator review.'],
    },
    sections: [],
  }
}

describe('runtime report bundle manifest', () => {
  it('creates a manifest from indexes and notes', () => {
    const index = createRuntimeReportIndex({
      title: 'Runtime Report Index',
      reports: [makeReport('report-1')],
      generatedAt: '2026-01-01T00:00:00.000Z',
    })
    const note = createRuntimeReportReleaseNote({
      title: 'Runtime Report Operator Note',
      index,
      generatedAt: '2026-01-01T00:00:00.000Z',
    })
    const manifest = createRuntimeReportBundleManifest({
      title: 'Runtime Report Bundle',
      indexes: [index],
      notes: [note],
      generatedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(manifest.snapshot.status).toBe('READY')
    expect(manifest.snapshot.itemCount).toBe(2)
    expect(manifest.snapshot.targetCount).toBe(4)
  })

  it('renders markdown manifest output', () => {
    const index = createRuntimeReportIndex({
      title: 'Runtime Report Index',
      reports: [makeReport('report-1')],
      generatedAt: '2026-01-01T00:00:00.000Z',
    })
    const manifest = createRuntimeReportBundleManifest({
      title: 'Runtime Report Bundle',
      indexes: [index],
      generatedAt: '2026-01-01T00:00:00.000Z',
    })
    const output = renderRuntimeReportBundleManifestMarkdown(manifest)

    expect(output).toContain('# Runtime Report Bundle')
    expect(output).toContain('Status: READY')
    expect(output).toContain('report:report-1:markdown')
  })

  it('renders json manifest output', () => {
    const manifest = createRuntimeReportBundleManifest({
      title: 'Runtime Report Bundle',
      generatedAt: '2026-01-01T00:00:00.000Z',
    })
    const parsed = JSON.parse(renderRuntimeReportBundleManifestJson(manifest)) as {
      readonly snapshot: { readonly itemCount: number; readonly status: string }
    }

    expect(parsed.snapshot.itemCount).toBe(0)
    expect(parsed.snapshot.status).toBe('READY')
  })
})
