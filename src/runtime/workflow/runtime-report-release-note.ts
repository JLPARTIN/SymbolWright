import type { RuntimeReportIndex } from './runtime-report-index.js'

export interface RuntimeReportReleaseNoteItem {
  readonly id: string
  readonly title: string
  readonly status: string
  readonly links: readonly string[]
}

export interface RuntimeReportReleaseNoteSnapshot {
  readonly title: string
  readonly generatedAt: string
  readonly status: string
  readonly entryCount: number
  readonly readyCount: number
  readonly needsReviewCount: number
  readonly blockedCount: number
  readonly items: readonly RuntimeReportReleaseNoteItem[]
}

export interface RuntimeReportReleaseNote {
  readonly title: string
  readonly generatedAt: string
  readonly snapshot: RuntimeReportReleaseNoteSnapshot
}

export function createRuntimeReportReleaseNote(input: {
  readonly title: string
  readonly index: RuntimeReportIndex
  readonly generatedAt?: string
}): RuntimeReportReleaseNote {
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const items: RuntimeReportReleaseNoteItem[] = input.index.entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    status: entry.status,
    links: entry.links.map((link) => link.target),
  }))

  return {
    title: input.title,
    generatedAt,
    snapshot: {
      title: input.index.title,
      generatedAt: input.index.generatedAt,
      status: input.index.summary.status,
      entryCount: input.index.summary.entryCount,
      readyCount: input.index.summary.readyCount,
      needsReviewCount: input.index.summary.needsReviewCount,
      blockedCount: input.index.summary.blockedCount,
      items,
    },
  }
}

export function renderRuntimeReportReleaseNoteMarkdown(note: RuntimeReportReleaseNote): string {
  return [
    `# ${note.title}`,
    '',
    `Generated: ${note.generatedAt}`,
    `Source index: ${note.snapshot.title}`,
    `Status: ${note.snapshot.status}`,
    `Entries: ${note.snapshot.entryCount}`,
    '',
    '## Summary',
    '',
    `Ready: ${note.snapshot.readyCount}`,
    `Needs review: ${note.snapshot.needsReviewCount}`,
    `Blocked: ${note.snapshot.blockedCount}`,
    '',
    '## Items',
    '',
    ...note.snapshot.items.flatMap((item) => [
      `- ${item.title} — ${item.status}`,
      ...item.links.map((link) => `  - ${link}`),
    ]),
    '',
    '## Boundary',
    '',
    '- Release note output is read-only.',
    '- No execution is performed.',
  ].join('\n')
}

export function renderRuntimeReportReleaseNoteJson(note: RuntimeReportReleaseNote): string {
  return JSON.stringify(note, null, 2)
}
