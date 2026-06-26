import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { createRuntimeReportBundleManifest } from './runtime/workflow/runtime-report-bundle-manifest.js'
import { createRuntimeReportCollection } from './runtime/workflow/runtime-report-collection.js'
import { createRuntimeReportIndex } from './runtime/workflow/runtime-report-index.js'
import { createRuntimeReportReleaseNote } from './runtime/workflow/runtime-report-release-note.js'
import type { ZflowReadiness } from './runtime/workflow/zflow-handoff.js'
import type { ZflowExecutionReport } from './runtime/workflow/zflow-report.js'
import { renderRuntimeReportHub } from './cli-runtime-report-hub.js'

function makeWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-report-hub-cli-'))
}

function writeFixture(workspace: string, fixture: unknown): string {
  const fixturePath = path.join(workspace, 'runtime-report-hub.fixture.json')
  fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2), 'utf8')
  return fixturePath
}

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
      prOutput: 'CodeMind GitHub PR creation\n\nOutcome: DRY_RUN',
      collaborationOutput: 'CodeMind PR collaboration\n\nOutcome: DRY_RUN',
      recoveryOutput: 'CodeMind recovery change ledger\n\nChanges: 1',
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
  generatedAt: TS,
})

const baseFixture = {
  title: 'Runtime Report Hub',
  format: 'markdown',
  generatedAt: TS,
  indexes: [index],
  notes: [note],
  manifests: [manifest],
  collections: [collection],
}

describe('renderRuntimeReportHub', () => {
  it('renders markdown from a fixture', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, baseFixture)
    const output = await renderRuntimeReportHub(fixturePath)

    expect(output).toContain('# Runtime Report Hub')
    expect(output).toContain('Status: READY')
    expect(output).toContain('Total surfaces: 4')
    expect(output).toContain('Indexes: 1')
    expect(output).toContain('Notes: 1')
    expect(output).toContain('Manifests: 1')
    expect(output).toContain('Collections: 1')
  })

  it('renders json from a fixture', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, { ...baseFixture, format: 'json' })
    const output = await renderRuntimeReportHub(fixturePath)
    const parsed = JSON.parse(output) as {
      readonly summary: {
        readonly status: string
        readonly totalSurfaceCount: number
        readonly indexCount: number
      }
    }

    expect(parsed.summary.status).toBe('READY')
    expect(parsed.summary.totalSurfaceCount).toBe(4)
    expect(parsed.summary.indexCount).toBe(1)
  })

  it('renders empty hub from minimal fixture', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, {
      title: 'Minimal Hub',
      format: 'markdown',
      generatedAt: TS,
    })
    const output = await renderRuntimeReportHub(fixturePath)

    expect(output).toContain('# Minimal Hub')
    expect(output).toContain('Status: READY')
    expect(output).toContain('Total surfaces: 0')
  })

  it('rejects missing fixture title', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, { ...baseFixture, title: '' })

    await expect(renderRuntimeReportHub(fixturePath)).rejects.toThrow(
      'Fixture must include a non-empty "title" field.',
    )
  })

  it('rejects invalid format', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, { ...baseFixture, format: 'xml' })

    await expect(renderRuntimeReportHub(fixturePath)).rejects.toThrow(
      'Fixture format must be "markdown" or "json".',
    )
  })

  it('rejects non-object fixture root', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, 'not-an-object')

    await expect(renderRuntimeReportHub(fixturePath)).rejects.toThrow(
      'Fixture must be a JSON object.',
    )
  })

  it('rejects non-array indexes field', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, { ...baseFixture, indexes: 'bad' })

    await expect(renderRuntimeReportHub(fixturePath)).rejects.toThrow(
      'Fixture "indexes" field must be an array when supplied.',
    )
  })

  it('rejects non-string generatedAt field', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, { ...baseFixture, generatedAt: 42 })

    await expect(renderRuntimeReportHub(fixturePath)).rejects.toThrow(
      'Fixture "generatedAt" field must be a string when supplied.',
    )
  })

  it('rejects non-object item in collections array', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, { ...baseFixture, collections: ['not-an-object'] })

    await expect(renderRuntimeReportHub(fixturePath)).rejects.toThrow(
      'Fixture collections item 1 must be an object.',
    )
  })
})
