import type { RuntimeReportIndex } from './runtime/workflow/runtime-report-index.js'
import {
  assertRecord,
  loadFixtureFile,
  parseFixtureFormat,
  parseFixtureGeneratedAt,
  parseFixtureTitle,
} from './runtime/workflow/runtime-report-fixture-guards.js'
import {
  createRuntimeReportReleaseNote,
  renderRuntimeReportReleaseNoteJson,
  renderRuntimeReportReleaseNoteMarkdown,
} from './runtime/workflow/runtime-report-release-note.js'

export interface RuntimeReportNoteFixtureRequest {
  readonly title: string
  readonly format: 'markdown' | 'json'
  readonly index: RuntimeReportIndex
  readonly generatedAt?: string
}

function parseFixture(raw: unknown): RuntimeReportNoteFixtureRequest {
  assertRecord(raw, 'Fixture must be a JSON object.')

  const title = parseFixtureTitle(raw)
  const generatedAt = parseFixtureGeneratedAt(raw)

  const index = raw['index']
  assertRecord(index, 'Fixture must include an "index" object.')

  return {
    title,
    format: parseFixtureFormat(raw['format']),
    index: index as unknown as RuntimeReportIndex,
    ...(generatedAt !== undefined ? { generatedAt } : {}),
  }
}

export async function renderRuntimeReportNote(fixturePath: string): Promise<string> {
  const raw = loadFixtureFile(fixturePath)
  const fixture = parseFixture(raw)
  const note = createRuntimeReportReleaseNote({
    title: fixture.title,
    index: fixture.index,
    ...(fixture.generatedAt !== undefined ? { generatedAt: fixture.generatedAt } : {}),
  })

  return fixture.format === 'json'
    ? renderRuntimeReportReleaseNoteJson(note)
    : renderRuntimeReportReleaseNoteMarkdown(note)
}
