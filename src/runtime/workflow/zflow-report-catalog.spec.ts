import { describe, expect, it } from 'vitest'

import type { ZflowExecutionReport } from './zflow-report.js'
import {
  createZflowReportArtifactManifest,
  createZflowReportCatalog,
  renderZflowReportArtifactManifestJson,
  renderZflowReportCatalogMarkdown,
} from './zflow-report-catalog.js'

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

describe('zflow report catalog', () => {
  it('creates catalog entries from reports', () => {
    const catalog = createZflowReportCatalog({
      title: 'Zflow Reports',
      reports: [makeReport('report-1'), makeReport('report-2')],
      generatedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(catalog.entries).toHaveLength(2)
    expect(catalog.entries[0]?.tags).toContain('prepare-pr')
    expect(catalog.entries[0]?.tags).toContain('READY_FOR_OPERATOR_REVIEW')
  })

  it('rejects duplicate report ids', () => {
    expect(() =>
      createZflowReportCatalog({
        title: 'Zflow Reports',
        reports: [makeReport('report-1'), makeReport('report-1')],
      }),
    ).toThrow('Duplicate Zflow report id: report-1')
  })

  it('renders catalog markdown', () => {
    const catalog = createZflowReportCatalog({
      title: 'Zflow Reports',
      reports: [makeReport('report-1')],
      generatedAt: '2026-01-01T00:00:00.000Z',
    })
    const output = renderZflowReportCatalogMarkdown(catalog)

    expect(output).toContain('# Zflow Reports')
    expect(output).toContain('Reports: 1')
    expect(output).toContain('Readiness: READY_FOR_OPERATOR_REVIEW')
    expect(output).toContain('No execution is performed.')
  })

  it('renders artifact manifest json', () => {
    const catalog = createZflowReportCatalog({
      title: 'Zflow Reports',
      reports: [makeReport('report-1')],
      generatedAt: '2026-01-01T00:00:00.000Z',
    })
    const manifest = createZflowReportArtifactManifest(catalog)
    const parsed = JSON.parse(renderZflowReportArtifactManifestJson(manifest)) as {
      readonly artifactCount: number
      readonly artifacts: readonly { readonly format: string }[]
    }

    expect(parsed.artifactCount).toBe(2)
    expect(parsed.artifacts.map((artifact) => artifact.format)).toEqual(['markdown', 'json'])
  })
})
