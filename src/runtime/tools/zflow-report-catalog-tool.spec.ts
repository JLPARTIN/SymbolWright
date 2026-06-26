import { describe, expect, it } from 'vitest'

import {
  createZflowReportCatalogRuntimeContext,
  createZflowReportCatalogRuntimeRegistry,
} from '../runtime-zflow-report-catalog-registry.js'
import { zflowReportCatalogTool } from './zflow-report-catalog-tool.js'

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

describe('zflowReportCatalogTool', () => {
  it('has expected metadata', () => {
    expect(zflowReportCatalogTool.name).toBe('zflow_report_catalog')
    expect(zflowReportCatalogTool.capability).toBe('ZFLOW_REPORT_CATALOG')
  })

  it('is registered in the catalog registry', () => {
    const registry = createZflowReportCatalogRuntimeRegistry()

    expect(registry.has('zflow_report_catalog')).toBe(true)
  })

  it('renders markdown catalog output', async () => {
    const output = await zflowReportCatalogTool.execute(
      {
        title: 'Zflow Reports',
        format: 'markdown',
        reports: [report],
        generatedAt: '2026-01-01T00:00:00.000Z',
      },
      createZflowReportCatalogRuntimeContext('/workspace'),
    )

    expect(output).toContain('# Zflow Reports')
    expect(output).toContain('Reports: 1')
    expect(output).toContain('READY_FOR_OPERATOR_REVIEW')
  })

  it('renders json manifest output', async () => {
    const output = await zflowReportCatalogTool.execute(
      {
        title: 'Zflow Reports',
        format: 'json',
        reports: [report],
        generatedAt: '2026-01-01T00:00:00.000Z',
      },
      createZflowReportCatalogRuntimeContext('/workspace'),
    )
    const parsed = JSON.parse(output) as { readonly artifactCount: number }

    expect(parsed.artifactCount).toBe(2)
  })

  it('rejects invalid input', async () => {
    await expect(
      zflowReportCatalogTool.execute(null, createZflowReportCatalogRuntimeContext('/workspace')),
    ).rejects.toThrow('Missing zflow report catalog input.')
  })
})
