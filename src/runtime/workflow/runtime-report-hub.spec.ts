import { describe, expect, it } from 'vitest'

import { createRuntimeReportBundleManifest } from './runtime-report-bundle-manifest.js'
import { createRuntimeReportCollection } from './runtime-report-collection.js'
import {
  createRuntimeReportHub,
  renderRuntimeReportHubJson,
  renderRuntimeReportHubMarkdown,
} from './runtime-report-hub.js'
import { createRuntimeReportIndex } from './runtime-report-index.js'
import { createRuntimeReportReleaseNote } from './runtime-report-release-note.js'
import type { ZflowReadiness } from './zflow-handoff.js'
import type { ZflowExecutionReport } from './zflow-report.js'

function makeReport(
  id: string,
  readiness: ZflowReadiness = 'READY_FOR_OPERATOR_REVIEW',
): ZflowExecutionReport {
  return {
    id,
    generatedAt: '2026-01-01T00:00:00.000Z',
    result: {
      mode: 'prepare-pr',
      localOutput: 'completed',
      prOutput: 'SymbolWright GitHub PR creation\n\nOutcome: DRY_RUN',
      collaborationOutput: 'SymbolWright PR collaboration\n\nOutcome: DRY_RUN',
      recoveryOutput: 'SymbolWright recovery change ledger\n\nChanges: 1',
      rollbackOutput: 'Rollback plan: Recover Zflow preview\n\n1. src/generated.ts',
    },
    readiness: {
      readiness,
      reasons: ['Status set.'],
    },
    sections: [],
  }
}

const TS = '2026-01-01T00:00:00.000Z'

describe('runtime report hub', () => {
  it('creates an empty hub with READY status', () => {
    const hub = createRuntimeReportHub({ title: 'Empty Hub', generatedAt: TS })

    expect(hub.summary.status).toBe('READY')
    expect(hub.summary.totalSurfaceCount).toBe(0)
    expect(hub.summary.indexCount).toBe(0)
    expect(hub.summary.noteCount).toBe(0)
    expect(hub.summary.manifestCount).toBe(0)
    expect(hub.summary.collectionCount).toBe(0)
    expect(hub.summary.readyCount).toBe(0)
    expect(hub.summary.needsReviewCount).toBe(0)
    expect(hub.summary.blockedCount).toBe(0)
  })

  it('creates a hub from all report surfaces', () => {
    const index = createRuntimeReportIndex({
      title: 'Index A',
      reports: [makeReport('r-1')],
      generatedAt: TS,
    })
    const note = createRuntimeReportReleaseNote({ title: 'Note A', index, generatedAt: TS })
    const manifest = createRuntimeReportBundleManifest({
      title: 'Manifest A',
      indexes: [index],
      notes: [note],
      generatedAt: TS,
    })
    const collection = createRuntimeReportCollection({
      title: 'Collection A',
      indexes: [index],
      notes: [note],
      manifests: [manifest],
      generatedAt: TS,
    })
    const hub = createRuntimeReportHub({
      title: 'Full Hub',
      indexes: [index],
      notes: [note],
      manifests: [manifest],
      collections: [collection],
      generatedAt: TS,
    })

    expect(hub.summary.status).toBe('READY')
    expect(hub.summary.indexCount).toBe(1)
    expect(hub.summary.noteCount).toBe(1)
    expect(hub.summary.manifestCount).toBe(1)
    expect(hub.summary.collectionCount).toBe(1)
    expect(hub.summary.totalSurfaceCount).toBe(4)
    expect(hub.summary.readyCount).toBe(4)
    expect(hub.summary.needsReviewCount).toBe(0)
    expect(hub.summary.blockedCount).toBe(0)
  })

  it('propagates BLOCKED status when any surface is blocked', () => {
    const readyIndex = createRuntimeReportIndex({
      title: 'Ready Index',
      reports: [makeReport('r-1')],
      generatedAt: TS,
    })
    const blockedIndex = createRuntimeReportIndex({
      title: 'Blocked Index',
      reports: [makeReport('r-2', 'BLOCKED')],
      generatedAt: TS,
    })

    const hub = createRuntimeReportHub({
      title: 'Mixed Hub',
      indexes: [readyIndex, blockedIndex],
      generatedAt: TS,
    })

    expect(hub.summary.status).toBe('BLOCKED')
    expect(hub.summary.blockedCount).toBe(1)
    expect(hub.summary.readyCount).toBe(1)
  })

  it('propagates NEEDS_REVIEW when no surface is blocked', () => {
    const readyIndex = createRuntimeReportIndex({
      title: 'Ready Index',
      reports: [makeReport('r-1')],
      generatedAt: TS,
    })
    const reviewIndex = createRuntimeReportIndex({
      title: 'Review Index',
      reports: [makeReport('r-2', 'NEEDS_RECOVERY_DETAIL')],
      generatedAt: TS,
    })

    const hub = createRuntimeReportHub({
      title: 'Review Hub',
      indexes: [readyIndex, reviewIndex],
      generatedAt: TS,
    })

    expect(hub.summary.status).toBe('NEEDS_REVIEW')
    expect(hub.summary.needsReviewCount).toBe(1)
    expect(hub.summary.readyCount).toBe(1)
    expect(hub.summary.blockedCount).toBe(0)
  })

  it('BLOCKED dominates NEEDS_REVIEW', () => {
    const reviewIndex = createRuntimeReportIndex({
      title: 'Review Index',
      reports: [makeReport('r-1', 'NEEDS_RECOVERY_DETAIL')],
      generatedAt: TS,
    })
    const blockedIndex = createRuntimeReportIndex({
      title: 'Blocked Index',
      reports: [makeReport('r-2', 'BLOCKED')],
      generatedAt: TS,
    })

    const hub = createRuntimeReportHub({
      title: 'Mixed Status Hub',
      indexes: [reviewIndex, blockedIndex],
      generatedAt: TS,
    })

    expect(hub.summary.status).toBe('BLOCKED')
  })

  it('renders markdown output', () => {
    const index = createRuntimeReportIndex({
      title: 'Index A',
      reports: [makeReport('r-1')],
      generatedAt: TS,
    })
    const note = createRuntimeReportReleaseNote({ title: 'Note A', index, generatedAt: TS })
    const hub = createRuntimeReportHub({
      title: 'Markdown Hub',
      indexes: [index],
      notes: [note],
      generatedAt: TS,
    })
    const output = renderRuntimeReportHubMarkdown(hub)

    expect(output).toContain('# Markdown Hub')
    expect(output).toContain('Status: READY')
    expect(output).toContain('Total surfaces: 2')
    expect(output).toContain('Indexes: 1')
    expect(output).toContain('Notes: 1')
    expect(output).toContain('Manifests: 0')
    expect(output).toContain('Collections: 0')
    expect(output).toContain('Ready: 2')
    expect(output).toContain('Needs review: 0')
    expect(output).toContain('Blocked: 0')
    expect(output).toContain('- Index A: READY')
    expect(output).toContain('- Note A: READY')
    expect(output).toContain('Report hub output is read-only.')
    expect(output).toContain('No execution is performed.')
  })

  it('renders json output', () => {
    const hub = createRuntimeReportHub({ title: 'JSON Hub', generatedAt: TS })
    const parsed = JSON.parse(renderRuntimeReportHubJson(hub)) as {
      readonly title: string
      readonly summary: { readonly status: string; readonly totalSurfaceCount: number }
    }

    expect(parsed.title).toBe('JSON Hub')
    expect(parsed.summary.status).toBe('READY')
    expect(parsed.summary.totalSurfaceCount).toBe(0)
  })

  it('renders json with full surface data', () => {
    const index = createRuntimeReportIndex({
      title: 'Index A',
      reports: [makeReport('r-1')],
      generatedAt: TS,
    })
    const collection = createRuntimeReportCollection({
      title: 'Collection A',
      indexes: [index],
      generatedAt: TS,
    })
    const hub = createRuntimeReportHub({
      title: 'Full JSON Hub',
      indexes: [index],
      collections: [collection],
      generatedAt: TS,
    })
    const parsed = JSON.parse(renderRuntimeReportHubJson(hub)) as {
      readonly indexes: readonly { readonly title: string }[]
      readonly collections: readonly { readonly title: string }[]
      readonly summary: { readonly totalSurfaceCount: number }
    }

    expect(parsed.indexes).toHaveLength(1)
    expect(parsed.collections).toHaveLength(1)
    expect(parsed.summary.totalSurfaceCount).toBe(2)
  })
})
