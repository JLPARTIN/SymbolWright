import type { ZflowExecutionReport, ZflowReportSnapshot } from './zflow-report.js'
import { createZflowReportSnapshot } from './zflow-report.js'

export interface ZflowReportCatalogEntry {
  readonly id: string
  readonly title: string
  readonly snapshot: ZflowReportSnapshot
  readonly tags: readonly string[]
}

export interface ZflowReportCatalog {
  readonly title: string
  readonly generatedAt: string
  readonly entries: readonly ZflowReportCatalogEntry[]
}

export interface ZflowReportArtifactManifest {
  readonly catalogTitle: string
  readonly generatedAt: string
  readonly artifactCount: number
  readonly artifacts: readonly ZflowReportArtifact[]
}

export interface ZflowReportArtifact {
  readonly id: string
  readonly title: string
  readonly format: 'markdown' | 'json'
  readonly readiness: string
  readonly localResult: string
}

export function createZflowReportCatalog(input: {
  readonly title: string
  readonly reports: readonly ZflowExecutionReport[]
  readonly generatedAt?: string
}): ZflowReportCatalog {
  const ids = new Set<string>()
  const entries: ZflowReportCatalogEntry[] = []

  for (const report of input.reports) {
    if (ids.has(report.id)) {
      throw new Error(`Duplicate Zflow report id: ${report.id}`)
    }

    ids.add(report.id)
    const snapshot = createZflowReportSnapshot(report)
    entries.push({
      id: report.id,
      title: `Zflow report ${report.id}`,
      snapshot,
      tags: [snapshot.mode, snapshot.readiness, snapshot.localResult],
    })
  }

  return {
    title: input.title,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    entries,
  }
}

export function createZflowReportArtifactManifest(
  catalog: ZflowReportCatalog,
): ZflowReportArtifactManifest {
  const artifacts: ZflowReportArtifact[] = catalog.entries.flatMap((entry) => [
    {
      id: `${entry.id}:markdown`,
      title: entry.title,
      format: 'markdown',
      readiness: entry.snapshot.readiness,
      localResult: entry.snapshot.localResult,
    },
    {
      id: `${entry.id}:json`,
      title: entry.title,
      format: 'json',
      readiness: entry.snapshot.readiness,
      localResult: entry.snapshot.localResult,
    },
  ])

  return {
    catalogTitle: catalog.title,
    generatedAt: catalog.generatedAt,
    artifactCount: artifacts.length,
    artifacts,
  }
}

export function renderZflowReportCatalogMarkdown(catalog: ZflowReportCatalog): string {
  if (catalog.entries.length === 0) {
    return [`# ${catalog.title}`, '', `Generated: ${catalog.generatedAt}`, '', 'No reports.'].join('\n')
  }

  return [
    `# ${catalog.title}`,
    '',
    `Generated: ${catalog.generatedAt}`,
    `Reports: ${catalog.entries.length}`,
    '',
    '## Entries',
    '',
    ...catalog.entries.flatMap((entry) => [
      `### ${entry.title}`,
      '',
      `ID: ${entry.id}`,
      `Mode: ${entry.snapshot.mode}`,
      `Local result: ${entry.snapshot.localResult}`,
      `Readiness: ${entry.snapshot.readiness}`,
      `Tags: ${entry.tags.join(', ')}`,
      '',
    ]),
    '## Boundary',
    '',
    '- Catalog output is report-only.',
    '- No execution is performed.',
  ].join('\n')
}

export function renderZflowReportArtifactManifestJson(
  manifest: ZflowReportArtifactManifest,
): string {
  return JSON.stringify(manifest, null, 2)
}
