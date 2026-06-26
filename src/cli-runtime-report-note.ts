import fs from 'node:fs'

import type { RuntimeReportIndex } from './runtime/workflow/runtime-report-index.js'
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

function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error(message)
  }
}

function parseFormat(value: unknown): 'markdown' | 'json' {
  if (value === 'markdown' || value === 'json') {
    return value
  }

  throw new Error('Fixture format must be "markdown" or "json".')
}

function parseFixture(raw: unknown): RuntimeReportNoteFixtureRequest {
  assertRecord(raw, 'Fixture must be a JSON object.')

  const title = raw['title']
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "title" field.')
  }

  const generatedAt = raw['generatedAt']
  if (generatedAt !== undefined && typeof generatedAt !== 'string') {
    throw new Error('Fixture "generatedAt" field must be a string when supplied.')
  }

  const index = raw['index']
  assertRecord(index, 'Fixture must include an "index" object.')

  return {
    title,
    format: parseFormat(raw['format']),
    index: index as unknown as RuntimeReportIndex,
    ...(generatedAt !== undefined ? { generatedAt } : {}),
  }
}

export async function renderRuntimeReportNote(fixturePath: string): Promise<string> {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as unknown
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
