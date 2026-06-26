import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { renderRuntimeZflowReport } from './cli-runtime-zflow-report.js'

function makeWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-zflow-report-cli-'))
}

function writeFixture(workspace: string, fixture: unknown): string {
  const fixturePath = path.join(workspace, 'zflow-report.fixture.json')
  fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2), 'utf8')
  return fixturePath
}

const baseFixture = {
  id: 'report-1',
  format: 'markdown',
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
    reasons: ['Zflow output includes local result, recovery ledger, and rollback plan.'],
  },
}

describe('renderRuntimeZflowReport', () => {
  it('renders markdown from a fixture', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, baseFixture)
    const output = await renderRuntimeZflowReport(fixturePath, workspace)

    expect(output).toContain('# CodeMind Zflow Execution Report')
    expect(output).toContain('Report ID: report-1')
    expect(output).toContain('Readiness: READY_FOR_OPERATOR_REVIEW')
  })

  it('renders json from a fixture', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, {
      ...baseFixture,
      format: 'json',
    })
    const output = await renderRuntimeZflowReport(fixturePath, workspace)
    const parsed = JSON.parse(output) as { report: { readonly id: string } }

    expect(parsed.report.id).toBe('report-1')
  })

  it('rejects missing fixture id', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, {
      ...baseFixture,
      id: '',
    })

    await expect(renderRuntimeZflowReport(fixturePath, workspace)).rejects.toThrow(
      'Fixture must include a non-empty "id" field.',
    )
  })

  it('rejects non-object fixture root', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, 'not-an-object')

    await expect(renderRuntimeZflowReport(fixturePath, workspace)).rejects.toThrow(
      'Fixture must be a JSON object.',
    )
  })

  it('rejects invalid format', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, {
      ...baseFixture,
      format: 'xml',
    })

    await expect(renderRuntimeZflowReport(fixturePath, workspace)).rejects.toThrow(
      'Fixture format must be "markdown" or "json".',
    )
  })

  it('rejects missing result object', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, {
      id: 'report-1',
      format: 'markdown',
      readiness: baseFixture.readiness,
    })

    await expect(renderRuntimeZflowReport(fixturePath, workspace)).rejects.toThrow(
      'Fixture must include a "result" object.',
    )
  })

  it('rejects missing readiness object', async () => {
    const workspace = makeWorkspace()
    const fixturePath = writeFixture(workspace, {
      id: 'report-1',
      format: 'markdown',
      result: baseFixture.result,
    })

    await expect(renderRuntimeZflowReport(fixturePath, workspace)).rejects.toThrow(
      'Fixture must include a "readiness" object.',
    )
  })
})
