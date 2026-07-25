import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { renderRuntimeZflowReportCatalog } from './cli-runtime-zflow-report-catalog.js'

function makeWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'symbolwright-zflow-report-catalog-cli-'))
}

function writeFixture(workspace: string, fixture: unknown): string {
  const fixturePath = path.join(workspace, 'zflow-report-catalog.fixture.json')
  fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2), 'utf8')
  return fixturePath
}

const report = {
  id: 'report-1',
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

const baseFixture = {
  title: 'Zflow Reports',
  format: 'markdown',
  generatedAt: '2026-01-01T00:00:00.000Z',
  reports: [report],
}

describe('renderRuntimeZflowReportCatalog', () => {
  it('renders markdown catalog from a fixture', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, baseFixture)
    const output = await renderRuntimeZflowReportCatalog(fixturePath, workspace)

    expect(output).toContain('# Zflow Reports')
    expect(output).toContain('Reports: 1')
    expect(output).toContain('READY_FOR_OPERATOR_REVIEW')
  })

  it('renders json manifest from a fixture', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, {
      ...baseFixture,
      format: 'json',
    })
    const output = await renderRuntimeZflowReportCatalog(fixturePath, workspace)
    const parsed = JSON.parse(output) as { readonly artifactCount: number }

    expect(parsed.artifactCount).toBe(2)
  })

  it('rejects missing fixture title', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, {
      ...baseFixture,
      title: '',
    })

    await expect(renderRuntimeZflowReportCatalog(fixturePath, workspace)).rejects.toThrow(
      'Fixture must include a non-empty "title" field.',
    )
  })

  it('rejects non-object fixture root', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, 'not-an-object')

    await expect(renderRuntimeZflowReportCatalog(fixturePath, workspace)).rejects.toThrow(
      'Fixture must be a JSON object.',
    )
  })

  it('rejects invalid format', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, {
      ...baseFixture,
      format: 'xml',
    })

    await expect(renderRuntimeZflowReportCatalog(fixturePath, workspace)).rejects.toThrow(
      'Fixture format must be "markdown" or "json".',
    )
  })

  it('rejects missing reports array', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, {
      title: 'Zflow Reports',
      format: 'markdown',
    })

    await expect(renderRuntimeZflowReportCatalog(fixturePath, workspace)).rejects.toThrow(
      'Fixture must include a "reports" array.',
    )
  })

  it('rejects non-string generatedAt', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, {
      ...baseFixture,
      generatedAt: 42,
    })

    await expect(renderRuntimeZflowReportCatalog(fixturePath, workspace)).rejects.toThrow(
      'Fixture "generatedAt" field must be a string when supplied.',
    )
  })
})
