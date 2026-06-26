import type { ZflowExecutionReport } from './zflow-report.js'
import type { ZflowReportCatalog, ZflowReportArtifactManifest } from './zflow-report-catalog.js'
import type { ZflowReportSuite } from './zflow-report-suite.js'

export type RuntimeReportIndexStatus = 'READY' | 'NEEDS_REVIEW' | 'BLOCKED'

export interface RuntimeReportIndexLink {
  readonly id: string
  readonly label: string
  readonly target: string
}

export interface RuntimeReportIndexEntry {
  readonly id: string
  readonly kind: 'report' | 'catalog' | 'manifest' | 'suite'
  readonly title: string
  readonly status: RuntimeReportIndexStatus
  readonly links: readonly RuntimeReportIndexLink[]
}

export interface RuntimeReportIndexSummary {
  readonly status: RuntimeReportIndexStatus
  readonly entryCount: number
  readonly readyCount: number
  readonly needsReviewCount: number
  readonly blockedCount: number
}

export interface RuntimeReportIndex {
  readonly title: string
  readonly generatedAt: string
  readonly summary: RuntimeReportIndexSummary
  readonly entries: readonly RuntimeReportIndexEntry[]
}

function statusFromReadiness(readiness: string): RuntimeReportIndexStatus {
  if (readiness === 'READY' || readiness === 'READY_FOR_OPERATOR_REVIEW') {
    return 'READY'
  }

  if (readiness === 'BLOCKED') {
    return 'BLOCKED'
  }

  return 'NEEDS_REVIEW'
}

function summarize(entries: readonly RuntimeReportIndexEntry[]): RuntimeReportIndexSummary {
  const readyCount = entries.filter((entry) => entry.status === 'READY').length
  const blockedCount = entries.filter((entry) => entry.status === 'BLOCKED').length
  const needsReviewCount = entries.length - readyCount - blockedCount
  const status: RuntimeReportIndexStatus = blockedCount > 0
    ? 'BLOCKED'
    : needsReviewCount > 0
      ? 'NEEDS_REVIEW'
      : 'READY'

  return {
    status,
    entryCount: entries.length,
    readyCount,
    needsReviewCount,
    blockedCount,
  }
}

export function createRuntimeReportIndex(input: {
  readonly title: string
  readonly reports?: readonly ZflowExecutionReport[]
  readonly catalog?: ZflowReportCatalog
  readonly manifest?: ZflowReportArtifactManifest
  readonly suite?: ZflowReportSuite
  readonly generatedAt?: string
}): RuntimeReportIndex {
  const entries: RuntimeReportIndexEntry[] = []

  for (const report of input.reports ?? []) {
    entries.push({
      id: report.id,
      kind: 'report',
      title: `Report ${report.id}`,
      status: statusFromReadiness(report.readiness.readiness),
      links: [
        { id: `${report.id}:markdown`, label: 'markdown', target: `report:${report.id}:markdown` },
        { id: `${report.id}:json`, label: 'json', target: `report:${report.id}:json` },
      ],
    })
  }

  if (input.catalog !== undefined) {
    entries.push({
      id: 'catalog',
      kind: 'catalog',
      title: input.catalog.title,
      status: summarize(input.catalog.entries.map((entry) => ({
        id: entry.id,
        kind: 'report' as const,
        title: entry.title,
        status: statusFromReadiness(entry.snapshot.readiness),
        links: [],
      }))).status,
      links: [{ id: 'catalog:markdown', label: 'markdown', target: 'catalog:markdown' }],
    })
  }

  if (input.manifest !== undefined) {
    entries.push({
      id: 'manifest',
      kind: 'manifest',
      title: input.manifest.catalogTitle,
      status: 'READY',
      links: [{ id: 'manifest:json', label: 'json', target: 'manifest:json' }],
    })
  }

  if (input.suite !== undefined) {
    entries.push({
      id: 'suite',
      kind: 'suite',
      title: input.suite.title,
      status: statusFromReadiness(input.suite.rollup.readiness),
      links: [
        { id: 'suite:markdown', label: 'markdown', target: 'suite:markdown' },
        { id: 'suite:json', label: 'json', target: 'suite:json' },
      ],
    })
  }

  return {
    title: input.title,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    summary: summarize(entries),
    entries,
  }
}

export function renderRuntimeReportIndexMarkdown(index: RuntimeReportIndex): string {
  return [
    `# ${index.title}`,
    '',
    `Generated: ${index.generatedAt}`,
    `Status: ${index.summary.status}`,
    `Entries: ${index.summary.entryCount}`,
    '',
    '## Build-state summary',
    '',
    `Ready: ${index.summary.readyCount}`,
    `Needs review: ${index.summary.needsReviewCount}`,
    `Blocked: ${index.summary.blockedCount}`,
    '',
    '## Entries',
    '',
    ...index.entries.flatMap((entry) => [
      `- ${entry.kind}: ${entry.title} — ${entry.status}`,
      ...entry.links.map((link) => `  - ${link.label}: ${link.target}`),
    ]),
    '',
    '## Boundary',
    '',
    '- Report index output is read-only.',
    '- No execution is performed.',
  ].join('\n')
}

export function renderRuntimeReportIndexJson(index: RuntimeReportIndex): string {
  return JSON.stringify(index, null, 2)
}
