import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { renderRuntimeReportIndex } from './cli-runtime-report-index.js'

function makeWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-report-index-cli-'))
}

function writeFixture(workspace: string, fixture: unknown): string {
  const fixturePath = path.join(workspace, 'runtime-report-index.fixture.json')
  fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2), 'utf8')
  return fixturePath
}

const report = {
  id: 'report-1',
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

const baseFixture = {
  title: 'Runtime Report Index',
  format: 'markdown',
  generatedAt: '2026-01-01T00:00:00.000Z',
  reports: [report],
}

describe('renderRuntimeReportIndex', () => {
  it('renders markdown index from a fixture', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, baseFixture)
    const output = await renderRuntimeReportIndex(fixturePath)

    expect(output).toContain('# Runtime Report Index')
    expect(output).toContain('## Build-state summary')
    expect(output).toContain('report:report-1:markdown')
  })

  it('renders json index from a fixture', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, {
      ...baseFixture,
      format: 'json',
    })
    const output = await renderRuntimeReportIndex(fixturePath)
    const parsed = JSON.parse(output) as { readonly summary: { readonly status: string } }

    expect(parsed.summary.status).toBe('READY')
  })

  it('rejects missing fixture title', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, {
      ...baseFixture,
      title: '',
    })

    await expect(renderRuntimeReportIndex(fixturePath)).rejects.toThrow(
      'Fixture must include a non-empty "title" field.',
    )
  })
})
