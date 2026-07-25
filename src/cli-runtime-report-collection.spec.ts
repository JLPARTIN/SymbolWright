import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { createRuntimeReportIndex } from './runtime/workflow/runtime-report-index.js'
import type { ZflowExecutionReport } from './runtime/workflow/zflow-report.js'
import { renderRuntimeReportCollection } from './cli-runtime-report-collection.js'

function makeWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'symbolwright-report-collection-cli-'))
}

function writeFixture(workspace: string, fixture: unknown): string {
  const fixturePath = path.join(workspace, 'runtime-report-collection.fixture.json')
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
      prOutput: 'SymbolWright GitHub PR creation\n\nOutcome: DRY_RUN',
      collaborationOutput: 'SymbolWright PR collaboration\n\nOutcome: DRY_RUN',
      recoveryOutput: 'SymbolWright recovery change ledger\n\nChanges: 1',
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
  title: 'Runtime Report Collection',
  format: 'markdown',
  generatedAt: '2026-01-01T00:00:00.000Z',
  indexes: [index],
}

describe('renderRuntimeReportCollection', () => {
  it('renders markdown from a fixture', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, baseFixture)
    const output = await renderRuntimeReportCollection(fixturePath)

    expect(output).toContain('# Runtime Report Collection')
    expect(output).toContain('Status: READY')
    expect(output).toContain('Indexes: 1')
  })

  it('renders json from a fixture', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, {
      ...baseFixture,
      format: 'json',
    })
    const output = await renderRuntimeReportCollection(fixturePath)
    const parsed = JSON.parse(output) as { readonly snapshot: { readonly indexCount: number } }

    expect(parsed.snapshot.indexCount).toBe(1)
  })

  it('rejects missing fixture title', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, {
      ...baseFixture,
      title: '',
    })

    await expect(renderRuntimeReportCollection(fixturePath)).rejects.toThrow(
      'Fixture must include a non-empty "title" field.',
    )
  })
})
