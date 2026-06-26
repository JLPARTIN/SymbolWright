import type { RuntimeReportIndex } from './runtime-report-index.js'
import type { RuntimeReportReleaseNote } from './runtime-report-release-note.js'

export interface RuntimeReportBundleManifestItem {
  readonly id: string
  readonly kind: 'index' | 'note'
  readonly title: string
  readonly status: string
  readonly targets: readonly string[]
}

export interface RuntimeReportBundleManifestSnapshot {
  readonly title: string
  readonly generatedAt: string
  readonly status: string
  readonly itemCount: number
  readonly targetCount: number
  readonly items: readonly RuntimeReportBundleManifestItem[]
}

export interface RuntimeReportBundleManifest {
  readonly title: string
  readonly generatedAt: string
  readonly snapshot: RuntimeReportBundleManifestSnapshot
}

function collectIndexTargets(index: RuntimeReportIndex): readonly string[] {
  return index.entries.flatMap((entry) => entry.links.map((link) => link.target))
}

function collectNoteTargets(note: RuntimeReportReleaseNote): readonly string[] {
  return note.snapshot.items.flatMap((item) => item.links)
}

function reduceStatus(statuses: readonly string[]): string {
  if (statuses.includes('BLOCKED')) {
    return 'BLOCKED'
  }

  if (statuses.includes('NEEDS_REVIEW')) {
    return 'NEEDS_REVIEW'
  }

  return 'READY'
}

export function createRuntimeReportBundleManifest(input: {
  readonly title: string
  readonly indexes?: readonly RuntimeReportIndex[]
  readonly notes?: readonly RuntimeReportReleaseNote[]
  readonly generatedAt?: string
}): RuntimeReportBundleManifest {
  const indexItems: RuntimeReportBundleManifestItem[] = (input.indexes ?? []).map((index) => ({
    id: index.title,
    kind: 'index',
    title: index.title,
    status: index.summary.status,
    targets: collectIndexTargets(index),
  }))
  const noteItems: RuntimeReportBundleManifestItem[] = (input.notes ?? []).map((note) => ({
    id: note.title,
    kind: 'note',
    title: note.title,
    status: note.snapshot.status,
    targets: collectNoteTargets(note),
  }))
  const items = [...indexItems, ...noteItems]
  const targetCount = items.reduce((sum, item) => sum + item.targets.length, 0)

  return {
    title: input.title,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    snapshot: {
      title: input.title,
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      status: reduceStatus(items.map((item) => item.status)),
      itemCount: items.length,
      targetCount,
      items,
    },
  }
}

export function renderRuntimeReportBundleManifestMarkdown(
  manifest: RuntimeReportBundleManifest,
): string {
  return [
    `# ${manifest.title}`,
    '',
    `Generated: ${manifest.generatedAt}`,
    `Status: ${manifest.snapshot.status}`,
    `Items: ${manifest.snapshot.itemCount}`,
    `Targets: ${manifest.snapshot.targetCount}`,
    '',
    '## Items',
    '',
    ...manifest.snapshot.items.flatMap((item) => [
      `- ${item.kind}: ${item.title} — ${item.status}`,
      ...item.targets.map((target) => `  - ${target}`),
    ]),
    '',
    '## Boundary',
    '',
    '- Bundle manifest output is read-only.',
    '- No execution is performed.',
  ].join('\n')
}

export function renderRuntimeReportBundleManifestJson(
  manifest: RuntimeReportBundleManifest,
): string {
  return JSON.stringify(manifest, null, 2)
}
