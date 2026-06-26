import type { RuntimeReportBundleManifest } from './runtime/workflow/runtime-report-bundle-manifest.js'
import type { RuntimeReportCollection } from './runtime/workflow/runtime-report-collection.js'
import {
  assertRecord,
  loadFixtureFile,
  parseFixtureFormat,
  parseFixtureGeneratedAt,
  parseFixtureTitle,
  parseOptionalArray,
} from './runtime/workflow/runtime-report-fixture-guards.js'
import {
  createRuntimeReportHub,
  renderRuntimeReportHubJson,
  renderRuntimeReportHubMarkdown,
} from './runtime/workflow/runtime-report-hub.js'
import type { RuntimeReportIndex } from './runtime/workflow/runtime-report-index.js'
import type { RuntimeReportReleaseNote } from './runtime/workflow/runtime-report-release-note.js'

export interface RuntimeReportHubFixtureRequest {
  readonly title: string
  readonly format: 'markdown' | 'json'
  readonly indexes?: readonly RuntimeReportIndex[]
  readonly notes?: readonly RuntimeReportReleaseNote[]
  readonly manifests?: readonly RuntimeReportBundleManifest[]
  readonly collections?: readonly RuntimeReportCollection[]
  readonly generatedAt?: string
}

function parseFixture(raw: unknown): RuntimeReportHubFixtureRequest {
  assertRecord(raw, 'Fixture must be a JSON object.')

  const title = parseFixtureTitle(raw)
  const generatedAt = parseFixtureGeneratedAt(raw)
  const indexes = parseOptionalArray<RuntimeReportIndex>(raw['indexes'], 'indexes')
  const notes = parseOptionalArray<RuntimeReportReleaseNote>(raw['notes'], 'notes')
  const manifests = parseOptionalArray<RuntimeReportBundleManifest>(raw['manifests'], 'manifests')
  const collections = parseOptionalArray<RuntimeReportCollection>(raw['collections'], 'collections')

  return {
    title,
    format: parseFixtureFormat(raw['format']),
    ...(indexes !== undefined ? { indexes } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(manifests !== undefined ? { manifests } : {}),
    ...(collections !== undefined ? { collections } : {}),
    ...(generatedAt !== undefined ? { generatedAt } : {}),
  }
}

export async function renderRuntimeReportHub(fixturePath: string): Promise<string> {
  const raw = loadFixtureFile(fixturePath)
  const fixture = parseFixture(raw)
  const hub = createRuntimeReportHub({
    title: fixture.title,
    ...(fixture.indexes !== undefined ? { indexes: fixture.indexes } : {}),
    ...(fixture.notes !== undefined ? { notes: fixture.notes } : {}),
    ...(fixture.manifests !== undefined ? { manifests: fixture.manifests } : {}),
    ...(fixture.collections !== undefined ? { collections: fixture.collections } : {}),
    ...(fixture.generatedAt !== undefined ? { generatedAt: fixture.generatedAt } : {}),
  })

  return fixture.format === 'json'
    ? renderRuntimeReportHubJson(hub)
    : renderRuntimeReportHubMarkdown(hub)
}
