import { describe, expect, it } from 'vitest'

import { createRuntimeReportBundleManifest } from './runtime-report-bundle-manifest.js'
import {
  createRuntimeReportCollection,
  renderRuntimeReportCollectionJson,
  renderRuntimeReportCollectionMarkdown,
} from './runtime-report-collection.js'
import { createRuntimeReportIndex } from './runtime-report-index.js'
import { createRuntimeReportReleaseNote } from './runtime-report-release-note.js'
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

describe('runtime report collection', () => {
  it('creates a collection from related report surfaces', () => {
    const index = createRuntimeReportIndex({
      title: 'Runtime Report Index',
      reports: [makeReport('report-1')],
    })
    const note = createRuntimeReportReleaseNote({ title: 'Runtime Report Operator Note', index })
    const manifest = createRuntimeReportBundleManifest({
      title: 'Runtime Report Bundle',
      indexes: [index],
      notes: [note],
    })
    const collection = createRuntimeReportCollection({
      title: 'Runtime Report Collection',
      indexes: [index],
      notes: [note],
      manifests: [manifest],
      generatedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(collection.snapshot.status).toBe('READY')
    expect(collection.snapshot.indexCount).toBe(1)
    expect(collection.snapshot.noteCount).toBe(1)
    expect(collection.snapshot.manifestCount).toBe(1)
    expect(collection.snapshot.targetCount).toBe(8)
  })

  it('renders markdown output', () => {
    const index = createRuntimeReportIndex({
      title: 'Runtime Report Index',
      reports: [makeReport('report-1')],
    })
    const collection = createRuntimeReportCollection({
      title: 'Runtime Report Collection',
      indexes: [index],
    })
    const output = renderRuntimeReportCollectionMarkdown(collection)

    expect(output).toContain('# Runtime Report Collection')
    expect(output).toContain('Status: READY')
    expect(output).toContain('Report collection output is read-only.')
  })

  it('renders json output', () => {
    const collection = createRuntimeReportCollection({ title: 'Runtime Report Collection' })
    const parsed = JSON.parse(renderRuntimeReportCollectionJson(collection)) as {
      readonly snapshot: { readonly status: string; readonly indexCount: number }
    }

    expect(parsed.snapshot.status).toBe('READY')
    expect(parsed.snapshot.indexCount).toBe(0)
  })
})
