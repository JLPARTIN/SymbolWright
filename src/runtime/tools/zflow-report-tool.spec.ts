import { describe, expect, it } from 'vitest'

import {
  createZflowReportRuntimeContext,
  createZflowReportRuntimeRegistry,
} from '../runtime-zflow-report-registry.js'
import { zflowReportTool } from './zflow-report-tool.js'

const result = {
  mode: 'prepare-pr',
  localOutput: 'completed',
  prOutput: 'CodeMind GitHub PR creation\n\nOutcome: DRY_RUN',
  collaborationOutput: 'CodeMind PR collaboration\n\nOutcome: DRY_RUN',
  recoveryOutput: 'CodeMind recovery change ledger\n\nChanges: 1',
  rollbackOutput: 'Rollback plan: Recover Zflow preview\n\n1. src/generated.ts',
}

const readiness = {
  readiness: 'READY_FOR_OPERATOR_REVIEW',
  reasons: ['Zflow output includes local result, recovery ledger, and rollback plan.'],
}

describe('zflowReportTool', () => {
  it('has expected metadata', () => {
    expect(zflowReportTool.name).toBe('zflow_report')
    expect(zflowReportTool.capability).toBe('ZFLOW_REPORT')
  })

  it('is registered in the zflow report registry', () => {
    const registry = createZflowReportRuntimeRegistry()

    expect(registry.has('zflow_report')).toBe(true)
  })

  it('renders markdown reports', async () => {
    const output = await zflowReportTool.execute(
      {
        id: 'report-1',
        format: 'markdown',
        result,
        readiness,
      },
      createZflowReportRuntimeContext('/workspace'),
    )

    expect(output).toContain('# CodeMind Zflow Execution Report')
    expect(output).toContain('Readiness: READY_FOR_OPERATOR_REVIEW')
  })

  it('renders json reports', async () => {
    const output = await zflowReportTool.execute(
      {
        id: 'report-1',
        format: 'json',
        result,
        readiness,
      },
      createZflowReportRuntimeContext('/workspace'),
    )
    const parsed = JSON.parse(output) as { report: { readonly id: string } }

    expect(parsed.report.id).toBe('report-1')
  })

  it('rejects invalid input', async () => {
    await expect(
      zflowReportTool.execute(null, createZflowReportRuntimeContext('/workspace')),
    ).rejects.toThrow('Missing zflow report input.')
  })
})
