import { describe, expect, it } from 'vitest'

import {
  createRuntimeReportReleaseNote,
  renderRuntimeReportReleaseNoteMarkdown,
  renderRuntimeReportReleaseNoteJson,
} from './runtime-report-release-note.js'
import { createRuntimeReportIndex } from './runtime-report-index.js'

function makeIndex() {
  return createRuntimeReportIndex({
    title: 'Test Index',
    reports: [
      {
        id: 'r-1',
        generatedAt: '2026-01-01T00:00:00.000Z',
        result: {
          mode: 'prepare-pr',
          localOutput: 'completed',
          prOutput: 'PR output',
          collaborationOutput: 'Collab output',
          recoveryOutput: 'Recovery output',
          rollbackOutput: 'Rollback output',
        },
        readiness: {
          readiness: 'READY_FOR_OPERATOR_REVIEW',
          reasons: ['All checks passed.'],
        },
        sections: [],
      },
      {
        id: 'r-2',
        generatedAt: '2026-01-02T00:00:00.000Z',
        result: {
          mode: 'local-apply',
          localOutput: 'completed',
          prOutput: null,
          collaborationOutput: null,
          recoveryOutput: 'Recovery output',
          rollbackOutput: 'Rollback output',
        },
        readiness: {
          readiness: 'BLOCKED',
          reasons: ['Validation failed.'],
        },
        sections: [],
      },
    ],
    generatedAt: '2026-01-03T00:00:00.000Z',
  })
}

describe('createRuntimeReportReleaseNote', () => {
  it('creates a release note from an index', () => {
    const index = makeIndex()
    const note = createRuntimeReportReleaseNote({
      title: 'v0.1.0 Release Notes',
      index,
    })

    expect(note.title).toBe('v0.1.0 Release Notes')
    expect(note.generatedAt).toBeDefined()
    expect(note.snapshot.title).toBe('Test Index')
    expect(note.snapshot.entryCount).toBe(2)
    expect(note.snapshot.items).toHaveLength(2)
  })

  it('uses provided generatedAt timestamp', () => {
    const index = makeIndex()
    const note = createRuntimeReportReleaseNote({
      title: 'Release',
      index,
      generatedAt: '2026-06-01T00:00:00.000Z',
    })

    expect(note.generatedAt).toBe('2026-06-01T00:00:00.000Z')
  })

  it('captures item ids, titles, and statuses', () => {
    const index = makeIndex()
    const note = createRuntimeReportReleaseNote({ title: 'Release', index })

    expect(note.snapshot.items[0]?.id).toBe('r-1')
    expect(note.snapshot.items[0]?.title).toBe('Report r-1')
    expect(note.snapshot.items[1]?.id).toBe('r-2')
  })

  it('captures links as target strings', () => {
    const index = makeIndex()
    const note = createRuntimeReportReleaseNote({ title: 'Release', index })

    expect(note.snapshot.items[0]?.links.length).toBeGreaterThanOrEqual(1)
    expect(note.snapshot.items[0]?.links[0]).toContain('report:r-1')
  })

  it('captures summary counts', () => {
    const index = makeIndex()
    const note = createRuntimeReportReleaseNote({ title: 'Release', index })

    expect(note.snapshot.readyCount + note.snapshot.blockedCount).toBeLessThanOrEqual(
      note.snapshot.entryCount,
    )
  })
})

describe('renderRuntimeReportReleaseNoteMarkdown', () => {
  it('renders markdown with title and summary', () => {
    const index = makeIndex()
    const note = createRuntimeReportReleaseNote({ title: 'v0.1.0 Release', index })
    const md = renderRuntimeReportReleaseNoteMarkdown(note)

    expect(md).toContain('# v0.1.0 Release')
    expect(md).toContain('Source index: Test Index')
    expect(md).toContain('## Summary')
    expect(md).toContain('## Items')
    expect(md).toContain('Report r-1')
    expect(md).toContain('Report r-2')
  })

  it('renders boundary section', () => {
    const index = makeIndex()
    const note = createRuntimeReportReleaseNote({ title: 'Release', index })
    const md = renderRuntimeReportReleaseNoteMarkdown(note)

    expect(md).toContain('## Boundary')
    expect(md).toContain('read-only')
  })
})

describe('renderRuntimeReportReleaseNoteJson', () => {
  it('renders valid JSON', () => {
    const index = makeIndex()
    const note = createRuntimeReportReleaseNote({ title: 'Release', index })
    const json = renderRuntimeReportReleaseNoteJson(note)

    const parsed = JSON.parse(json)
    expect(parsed.title).toBe('Release')
    expect(parsed.snapshot.items).toHaveLength(2)
  })
})
