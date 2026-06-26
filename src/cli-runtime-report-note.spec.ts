import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { createRuntimeReportIndex } from './runtime/workflow/runtime-report-index.js'
import type { ZflowExecutionReport } from './runtime/workflow/zflow-report.js'
import { renderRuntimeReportNote } from './cli-runtime-report-note.js'

function makeWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-report-note-cli-'))
}

function writeFixture(workspace: string, fixture: unknown): string {
  const fixturePath = path.join(workspace, 'runtime-report-note.fixture.json')
  fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2), 'utf8')
  return fixturePath
}

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

const index = createRuntimeReportIndex({
  title: 'Runtime Report Index',
  reports: [makeReport('report-1')],
  generatedAt: '2026-01-01T00:00:00.000Z',
})

const baseFixture = {
  title: 'Runtime Report Operator Note',
  format: 'markdown',
  generatedAt: '2026-01-01T00:00:00.000Z',
  index,
}

describe('renderRuntimeReportNote', () => {
  it('renders markdown from a fixture', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, baseFixture)
    const output = await renderRuntimeReportNote(fixturePath)

    expect(output).toContain('# Runtime Report Operator Note')
    expect(output).toContain('Status: READY')
    expect(output).toContain('report:report-1:markdown')
  })

  it('renders json from a fixture', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, {
      ...baseFixture,
      format: 'json',
    })
    const output = await renderRuntimeReportNote(fixturePath)
    const parsed = JSON.parse(output) as { readonly snapshot: { readonly status: string } }

    expect(parsed.snapshot.status).toBe('READY')
  })

  it('rejects missing fixture title', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, {
      ...baseFixture,
      title: '',
    })

    await expect(renderRuntimeReportNote(fixturePath)).rejects.toThrow(
      'Fixture must include a non-empty "title" field.',
    )
  })
})
