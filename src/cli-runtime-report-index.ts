import fs from 'node:fs'

import {
  createRuntimeReportIndex,
  renderRuntimeReportIndexJson,
  renderRuntimeReportIndexMarkdown,
} from './runtime/workflow/runtime-report-index.js'
import type { ZflowExecutionReport } from './runtime/workflow/zflow-report.js'
import type { ZflowReportCatalog, ZflowReportArtifactManifest } from './runtime/workflow/zflow-report-catalog.js'
import type { ZflowReportSuite } from './runtime/workflow/zflow-report-suite.js'

export interface RuntimeReportIndexFixtureRequest {
  readonly title: string
  readonly format: 'markdown' | 'json'
  readonly reports?: readonly ZflowExecutionReport[]
  readonly catalog?: ZflowReportCatalog
  readonly manifest?: ZflowReportArtifactManifest
  readonly suite?: ZflowReportSuite
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

function parseReports(value: unknown): readonly ZflowExecutionReport[] | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!Array.isArray(value)) {
    throw new Error('Fixture "reports" field must be an array when supplied.')
  }

  return value.map((report, index) => {
    assertRecord(report, `Fixture report ${index + 1} must be an object.`)
    return report as unknown as ZflowExecutionReport
  })
}

function parseOptionalRecord<T>(value: unknown, name: string): T | undefined {
  if (value === undefined) {
    return undefined
  }

  assertRecord(value, `Fixture "${name}" field must be an object when supplied.`)
  return value as unknown as T
}

function parseFixture(raw: unknown): RuntimeReportIndexFixtureRequest {
  assertRecord(raw, 'Fixture must be a JSON object.')

  const title = raw['title']
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "title" field.')
  }

  const generatedAt = raw['generatedAt']
  if (generatedAt !== undefined && typeof generatedAt !== 'string') {
    throw new Error('Fixture "generatedAt" field must be a string when supplied.')
  }

  return {
    title,
    format: parseFormat(raw['format']),
    ...(parseReports(raw['reports']) !== undefined ? { reports: parseReports(raw['reports']) } : {}),
    ...(parseOptionalRecord<ZflowReportCatalog>(raw['catalog'], 'catalog') !== undefined
      ? { catalog: parseOptionalRecord<ZflowReportCatalog>(raw['catalog'], 'catalog') }
      : {}),
    ...(parseOptionalRecord<ZflowReportArtifactManifest>(raw['manifest'], 'manifest') !== undefined
      ? { manifest: parseOptionalRecord<ZflowReportArtifactManifest>(raw['manifest'], 'manifest') }
      : {}),
    ...(parseOptionalRecord<ZflowReportSuite>(raw['suite'], 'suite') !== undefined
      ? { suite: parseOptionalRecord<ZflowReportSuite>(raw['suite'], 'suite') }
      : {}),
    ...(generatedAt !== undefined ? { generatedAt } : {}),
  }
}

export async function renderRuntimeReportIndex(
  fixturePath: string,
): Promise<string> {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as unknown
  const fixture = parseFixture(raw)
  const index = createRuntimeReportIndex({
    title: fixture.title,
    ...(fixture.reports !== undefined ? { reports: fixture.reports } : {}),
    ...(fixture.catalog !== undefined ? { catalog: fixture.catalog } : {}),
    ...(fixture.manifest !== undefined ? { manifest: fixture.manifest } : {}),
    ...(fixture.suite !== undefined ? { suite: fixture.suite } : {}),
    ...(fixture.generatedAt !== undefined ? { generatedAt: fixture.generatedAt } : {}),
  })

  return fixture.format === 'json'
    ? renderRuntimeReportIndexJson(index)
    : renderRuntimeReportIndexMarkdown(index)
}
