import { describe, expect, it } from 'vitest'

import { createZflowReportCatalog } from '../workflow/zflow-report-catalog.js'
import type { ZflowExecutionReport } from '../workflow/zflow-report.js'
import { zflowReportRollupTool } from './zflow-report-rollup-tool.js'

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

const catalog = createZflowReportCatalog({
  title: 'Zflow Reports',
  reports: [makeReport('report-1')],
  generatedAt: '2026-01-01T00:00:00.000Z',
})

const context = {
  cwd: '/workspace',
  policy: {
    mode: 'READ_ONLY' as const,
    allowNetwork: false,
    allowShell: false,
    allowWrites: false,
    allowGitHubWrites: false,
    protectedPaths: [],
    noisyDirs: [],
  },
}

describe('zflowReportRollupTool', () => {
  it('uses the existing catalog tool boundary', () => {
    expect(zflowReportRollupTool.name).toBe('zflow_report_catalog')
    expect(zflowReportRollupTool.capability).toBe('ZFLOW_REPORT_CATALOG')
  })

  it('renders markdown output', async () => {
    const output = await zflowReportRollupTool.execute(
      {
        title: 'Zflow Suite',
        format: 'markdown',
        catalog,
        generatedAt: '2026-01-01T00:00:00.000Z',
      },
      context,
    )

    expect(output).toContain('# Zflow Suite')
    expect(output).toContain('Readiness: READY')
  })

  it('renders json output', async () => {
    const output = await zflowReportRollupTool.execute(
      {
        title: 'Zflow Suite',
        format: 'json',
        catalog,
      },
      context,
    )
    const parsed = JSON.parse(output) as { readonly rollup: { readonly readiness: string } }

    expect(parsed.rollup.readiness).toBe('READY')
  })

  it('rejects invalid input', async () => {
    await expect(zflowReportRollupTool.execute(null, context)).rejects.toThrow(
      'Missing zflow report rollup input.',
    )
  })
})
