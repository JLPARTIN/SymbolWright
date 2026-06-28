import {
  createRuntimeReportIndex,
  renderRuntimeReportIndexJson,
  renderRuntimeReportIndexMarkdown,
} from './runtime/workflow/runtime-report-index.js'
import {
  assertRecord,
  loadFixtureFile,
  parseFixtureFormat,
  parseFixtureGeneratedAt,
  parseFixtureTitle,
  parseOptionalRecord,
} from './runtime/workflow/runtime-report-fixture-guards.js'
import type { ZflowExecutionReport } from './runtime/workflow/zflow-report.js'
import type {
  ZflowReportCatalog,
  ZflowReportArtifactManifest,
} from './runtime/workflow/zflow-report-catalog.js'
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

function parseFixture(raw: unknown): RuntimeReportIndexFixtureRequest {
  assertRecord(raw, 'Fixture must be a JSON object.')

  const title = parseFixtureTitle(raw)
  const generatedAt = parseFixtureGeneratedAt(raw)
  const reports = parseReports(raw['reports'])
  const catalog = parseOptionalRecord<ZflowReportCatalog>(raw['catalog'], 'catalog')
  const manifest = parseOptionalRecord<ZflowReportArtifactManifest>(raw['manifest'], 'manifest')
  const suite = parseOptionalRecord<ZflowReportSuite>(raw['suite'], 'suite')

  return {
    title,
    format: parseFixtureFormat(raw['format']),
    ...(reports !== undefined ? { reports } : {}),
    ...(catalog !== undefined ? { catalog } : {}),
    ...(manifest !== undefined ? { manifest } : {}),
    ...(suite !== undefined ? { suite } : {}),
    ...(generatedAt !== undefined ? { generatedAt } : {}),
  }
}

export async function renderRuntimeReportIndex(fixturePath: string): Promise<string> {
  const raw = loadFixtureFile(fixturePath)
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
