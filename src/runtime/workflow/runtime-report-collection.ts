import type { RuntimeReportBundleManifest } from './runtime-report-bundle-manifest.js'
import type { RuntimeReportIndex } from './runtime-report-index.js'
import type { RuntimeReportReleaseNote } from './runtime-report-release-note.js'
import { reduceStatuses } from './runtime-report-status.js'

export interface RuntimeReportCollectionSnapshot {
  readonly title: string
  readonly generatedAt: string
  readonly status: string
  readonly indexCount: number
  readonly noteCount: number
  readonly manifestCount: number
  readonly targetCount: number
}

export interface RuntimeReportCollection {
  readonly title: string
  readonly generatedAt: string
  readonly indexes: readonly RuntimeReportIndex[]
  readonly notes: readonly RuntimeReportReleaseNote[]
  readonly manifests: readonly RuntimeReportBundleManifest[]
  readonly snapshot: RuntimeReportCollectionSnapshot
}

function countIndexTargets(index: RuntimeReportIndex): number {
  return index.entries.reduce((sum, entry) => sum + entry.links.length, 0)
}

function countNoteTargets(note: RuntimeReportReleaseNote): number {
  return note.snapshot.items.reduce((sum, item) => sum + item.links.length, 0)
}

export function createRuntimeReportCollection(input: {
  readonly title: string
  readonly indexes?: readonly RuntimeReportIndex[]
  readonly notes?: readonly RuntimeReportReleaseNote[]
  readonly manifests?: readonly RuntimeReportBundleManifest[]
  readonly generatedAt?: string
}): RuntimeReportCollection {
  const indexes = input.indexes ?? []
  const notes = input.notes ?? []
  const manifests = input.manifests ?? []
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const status = reduceStatuses([
    ...indexes.map((index) => index.summary.status),
    ...notes.map((note) => note.snapshot.status),
    ...manifests.map((manifest) => manifest.snapshot.status),
  ])
  const targetCount =
    indexes.reduce((sum, index) => sum + countIndexTargets(index), 0) +
    notes.reduce((sum, note) => sum + countNoteTargets(note), 0) +
    manifests.reduce((sum, manifest) => sum + manifest.snapshot.targetCount, 0)

  return {
    title: input.title,
    generatedAt,
    indexes,
    notes,
    manifests,
    snapshot: {
      title: input.title,
      generatedAt,
      status,
      indexCount: indexes.length,
      noteCount: notes.length,
      manifestCount: manifests.length,
      targetCount,
    },
  }
}

export function renderRuntimeReportCollectionMarkdown(collection: RuntimeReportCollection): string {
  return [
    `# ${collection.title}`,
    '',
    `Generated: ${collection.generatedAt}`,
    `Status: ${collection.snapshot.status}`,
    `Indexes: ${collection.snapshot.indexCount}`,
    `Notes: ${collection.snapshot.noteCount}`,
    `Manifests: ${collection.snapshot.manifestCount}`,
    `Targets: ${collection.snapshot.targetCount}`,
    '',
    '## Indexes',
    '',
    ...collection.indexes.map((index) => `- ${index.title}: ${index.summary.status}`),
    '',
    '## Notes',
    '',
    ...collection.notes.map((note) => `- ${note.title}: ${note.snapshot.status}`),
    '',
    '## Manifests',
    '',
    ...collection.manifests.map((manifest) => `- ${manifest.title}: ${manifest.snapshot.status}`),
    '',
    '## Boundary',
    '',
    '- Report collection output is read-only.',
    '- No execution is performed.',
  ].join('\n')
}

export function renderRuntimeReportCollectionJson(collection: RuntimeReportCollection): string {
  return JSON.stringify(collection, null, 2)
}
