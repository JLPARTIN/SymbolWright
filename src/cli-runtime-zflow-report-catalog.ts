import fs from 'node:fs'

import {
  createZflowReportCatalogRuntimeContext,
  createZflowReportCatalogRuntimeRegistry,
} from './runtime/runtime-zflow-report-catalog-registry.js'
import type { ZflowExecutionReport } from './runtime/workflow/zflow-report.js'

export interface ZflowReportCatalogFixtureRequest {
  readonly title: string
  readonly format: 'markdown' | 'json'
  readonly reports: readonly ZflowExecutionReport[]
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
    reports: parseReports(raw['reports']),
    ...(generatedAt !== undefined ? { generatedAt } : {}),
  }
}

export async function renderRuntimeZflowReportCatalog(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as unknown
  const fixture = parseFixture(raw)
  const registry = createZflowReportCatalogRuntimeRegistry()
  const context = createZflowReportCatalogRuntimeContext(cwd)

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
