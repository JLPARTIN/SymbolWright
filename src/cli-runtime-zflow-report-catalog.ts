import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'
import {
  assertRecord,
  loadFixtureFile,
  parseFixtureFormat,
  parseFixtureGeneratedAt,
  parseFixtureTitle,
} from './runtime/workflow/runtime-report-fixture-guards.js'
import type { ZflowExecutionReport } from './runtime/workflow/zflow-report.js'

export interface ZflowReportCatalogFixtureRequest {
  readonly title: string
  readonly format: 'markdown' | 'json'
  readonly reports: readonly ZflowExecutionReport[]
  readonly generatedAt?: string
}

function parseReports(value: unknown): readonly ZflowExecutionReport[] {
  if (!Array.isArray(value)) {
    throw new Error('Fixture must include a "reports" array.')
  }

  return value.map((report, index) => {
    assertRecord(report, `Fixture report ${index + 1} must be an object.`)
    return report as unknown as ZflowExecutionReport
  })
}

function parseFixture(raw: unknown): ZflowReportCatalogFixtureRequest {
  assertRecord(raw, 'Fixture must be a JSON object.')

  const title = parseFixtureTitle(raw)
  const generatedAt = parseFixtureGeneratedAt(raw)

  return {
    title,
    format: parseFixtureFormat(raw['format']),
    reports: parseReports(raw['reports']),
    ...(generatedAt !== undefined ? { generatedAt } : {}),
  }
}

export async function renderRuntimeZflowReportCatalog(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const raw = loadFixtureFile(fixturePath)
  const fixture = parseFixture(raw)
  const registry = createFixtureRegistry('zflow_report_catalog')
  const context = createFixtureContext(cwd)

  const tool = registry.getOrThrow('zflow_report_catalog')
  return tool.execute(
    {
      title: fixture.title,
      format: fixture.format,
      reports: fixture.reports,
      ...(fixture.generatedAt !== undefined ? { generatedAt: fixture.generatedAt } : {}),
    },
    context,
  )
}
