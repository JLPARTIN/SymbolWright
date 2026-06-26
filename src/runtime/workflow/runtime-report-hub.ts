import type { RuntimeReportBundleManifest } from './runtime-report-bundle-manifest.js'
import type { RuntimeReportCollection } from './runtime-report-collection.js'
import type { RuntimeReportIndex } from './runtime-report-index.js'
import type { RuntimeReportReleaseNote } from './runtime-report-release-note.js'

export type RuntimeReportHubStatus = 'READY' | 'NEEDS_REVIEW' | 'BLOCKED'

export interface RuntimeReportHubSummary {
  readonly status: RuntimeReportHubStatus
  readonly indexCount: number
  readonly noteCount: number
  readonly manifestCount: number
  readonly collectionCount: number
  readonly totalSurfaceCount: number
  readonly readyCount: number
  readonly needsReviewCount: number
  readonly blockedCount: number
}

export interface RuntimeReportHub {
  readonly title: string
  readonly generatedAt: string
  readonly indexes: readonly RuntimeReportIndex[]
  readonly notes: readonly RuntimeReportReleaseNote[]
  readonly manifests: readonly RuntimeReportBundleManifest[]
  readonly collections: readonly RuntimeReportCollection[]
  readonly summary: RuntimeReportHubSummary
}

function reduceStatus(statuses: readonly string[]): RuntimeReportHubStatus {
  if (statuses.includes('BLOCKED')) {
    return 'BLOCKED'
  }

  if (statuses.includes('NEEDS_REVIEW')) {
    return 'NEEDS_REVIEW'
  }

  return 'READY'
}

function collectStatuses(
  indexes: readonly RuntimeReportIndex[],
  notes: readonly RuntimeReportReleaseNote[],
  manifests: readonly RuntimeReportBundleManifest[],
  collections: readonly RuntimeReportCollection[],
): readonly string[] {
  return [
    ...indexes.map((index) => index.summary.status),
    ...notes.map((note) => note.snapshot.status),
    ...manifests.map((manifest) => manifest.snapshot.status),
    ...collections.map((collection) => collection.snapshot.status),
  ]
}

function countByStatus(statuses: readonly string[], target: RuntimeReportHubStatus): number {
  return statuses.filter((s) => s === target).length
}

export function createRuntimeReportHub(input: {
  readonly title: string
  readonly indexes?: readonly RuntimeReportIndex[]
  readonly notes?: readonly RuntimeReportReleaseNote[]
  readonly manifests?: readonly RuntimeReportBundleManifest[]
  readonly collections?: readonly RuntimeReportCollection[]
  readonly generatedAt?: string
}): RuntimeReportHub {
  const indexes = input.indexes ?? []
  const notes = input.notes ?? []
  const manifests = input.manifests ?? []
  const collections = input.collections ?? []
  const generatedAt = input.generatedAt ?? new Date().toISOString()

  const allStatuses = collectStatuses(indexes, notes, manifests, collections)
  const totalSurfaceCount = allStatuses.length

  const readyCount = countByStatus(allStatuses, 'READY')
  const blockedCount = countByStatus(allStatuses, 'BLOCKED')
  const needsReviewCount = totalSurfaceCount - readyCount - blockedCount

  return {
    title: input.title,
    generatedAt,
    indexes,
    notes,
    manifests,
    collections,
    summary: {
      status: reduceStatus(allStatuses),
      indexCount: indexes.length,
      noteCount: notes.length,
      manifestCount: manifests.length,
      collectionCount: collections.length,
      totalSurfaceCount,
      readyCount,
      needsReviewCount,
      blockedCount,
    },
  }
}

export function renderRuntimeReportHubMarkdown(hub: RuntimeReportHub): string {
  return [
    `# ${hub.title}`,
    '',
    `Generated: ${hub.generatedAt}`,
    `Status: ${hub.summary.status}`,
    `Total surfaces: ${hub.summary.totalSurfaceCount}`,
    '',
    '## Summary',
    '',
    `Indexes: ${hub.summary.indexCount}`,
    `Notes: ${hub.summary.noteCount}`,
    `Manifests: ${hub.summary.manifestCount}`,
    `Collections: ${hub.summary.collectionCount}`,
    '',
    `Ready: ${hub.summary.readyCount}`,
    `Needs review: ${hub.summary.needsReviewCount}`,
    `Blocked: ${hub.summary.blockedCount}`,
    '',
    '## Indexes',
    '',
    ...hub.indexes.map((index) => `- ${index.title}: ${index.summary.status}`),
    '',
    '## Notes',
    '',
    ...hub.notes.map((note) => `- ${note.title}: ${note.snapshot.status}`),
    '',
    '## Manifests',
    '',
    ...hub.manifests.map((manifest) => `- ${manifest.title}: ${manifest.snapshot.status}`),
    '',
    '## Collections',
    '',
    ...hub.collections.map((collection) => `- ${collection.title}: ${collection.snapshot.status}`),
    '',
    '## Boundary',
    '',
    '- Report hub output is read-only.',
    '- No execution is performed.',
  ].join('\n')
}

export function renderRuntimeReportHubJson(hub: RuntimeReportHub): string {
  return JSON.stringify(hub, null, 2)
}
