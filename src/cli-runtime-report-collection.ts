import fs from 'node:fs'

import type { RuntimeReportBundleManifest } from './runtime/workflow/runtime-report-bundle-manifest.js'
import {
  createRuntimeReportCollection,
  renderRuntimeReportCollectionJson,
  renderRuntimeReportCollectionMarkdown,
} from './runtime/workflow/runtime-report-collection.js'
import type { RuntimeReportIndex } from './runtime/workflow/runtime-report-index.js'
import type { RuntimeReportReleaseNote } from './runtime/workflow/runtime-report-release-note.js'

export interface RuntimeReportCollectionFixtureRequest {
  readonly title: string
  readonly format: 'markdown' | 'json'
  readonly indexes?: readonly RuntimeReportIndex[]
  readonly notes?: readonly RuntimeReportReleaseNote[]
  readonly manifests?: readonly RuntimeReportBundleManifest[]
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

function parseOptionalArray<T>(value: unknown, name: string): readonly T[] | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!Array.isArray(value)) {
    throw new Error(`Fixture "${name}" field must be an array when supplied.`)
  }

  return value.map((item, index) => {
    assertRecord(item, `Fixture ${name} item ${index + 1} must be an object.`)
    return item as unknown as T
  })
}

function parseFixture(raw: unknown): RuntimeReportCollectionFixtureRequest {
  assertRecord(raw, 'Fixture must be a JSON object.')

  const title = raw['title']
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "title" field.')
  }

  const generatedAt = raw['generatedAt']
  if (generatedAt !== undefined && typeof generatedAt !== 'string') {
    throw new Error('Fixture "generatedAt" field must be a string when supplied.')
  }

  const indexes = parseOptionalArray<RuntimeReportIndex>(raw['indexes'], 'indexes')
  const notes = parseOptionalArray<RuntimeReportReleaseNote>(raw['notes'], 'notes')
  const manifests = parseOptionalArray<RuntimeReportBundleManifest>(raw['manifests'], 'manifests')

  return {
    title,
    format: parseFormat(raw['format']),
    ...(indexes !== undefined ? { indexes } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(manifests !== undefined ? { manifests } : {}),
    ...(generatedAt !== undefined ? { generatedAt } : {}),
  }
}

export async function renderRuntimeReportCollection(fixturePath: string): Promise<string> {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as unknown
  const fixture = parseFixture(raw)
  const collection = createRuntimeReportCollection({
    title: fixture.title,
    ...(fixture.indexes !== undefined ? { indexes: fixture.indexes } : {}),
    ...(fixture.notes !== undefined ? { notes: fixture.notes } : {}),
    ...(fixture.manifests !== undefined ? { manifests: fixture.manifests } : {}),
    ...(fixture.generatedAt !== undefined ? { generatedAt: fixture.generatedAt } : {}),
  })

  return fixture.format === 'json'
    ? renderRuntimeReportCollectionJson(collection)
    : renderRuntimeReportCollectionMarkdown(collection)
}
