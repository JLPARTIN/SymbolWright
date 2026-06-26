import { describe, expect, it } from 'vitest'

import { createRuntimeReportIndex } from './runtime-report-index.js'
import {
  createRuntimeReportReleaseNote,
  renderRuntimeReportReleaseNoteJson,
  renderRuntimeReportReleaseNoteMarkdown,
} from './runtime-report-release-note.js'
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

describe('runtime report operator note', () => {
  it('creates a note snapshot from an index', () => {
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

    expect(note.snapshot.status).toBe('READY')
    expect(note.snapshot.entryCount).toBe(1)
    expect(note.snapshot.items[0]?.links).toContain('report:report-1:markdown')
  })

  it('renders markdown notes', () => {
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
    const output = renderRuntimeReportReleaseNoteMarkdown(note)

    expect(output).toContain('# Runtime Report Operator Note')
    expect(output).toContain('Status: READY')
    expect(output).toContain('Release note output is read-only.')
  })

  it('renders json notes', () => {
    const index = createRuntimeReportIndex({
      title: 'Runtime Report Index',
      reports: [makeReport('report-1')],
    })
    const note = createRuntimeReportReleaseNote({
      title: 'Runtime Report Operator Note',
      index,
    })
    const parsed = JSON.parse(renderRuntimeReportReleaseNoteJson(note)) as {
      readonly snapshot: { readonly status: string; readonly entryCount: number }
    }

    expect(parsed.snapshot.status).toBe('READY')
    expect(parsed.snapshot.entryCount).toBe(1)
  })
})
