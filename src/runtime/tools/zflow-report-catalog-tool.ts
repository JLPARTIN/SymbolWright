import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import {
  createZflowReportArtifactManifest,
  createZflowReportCatalog,
  renderZflowReportArtifactManifestJson,
  renderZflowReportCatalogMarkdown,
} from '../workflow/zflow-report-catalog.js'
import type { ZflowExecutionReport } from '../workflow/zflow-report.js'

export interface ZflowReportCatalogToolInput {
  readonly title: string
  readonly format: 'markdown' | 'json'
  readonly reports: readonly ZflowExecutionReport[]
  readonly generatedAt?: string
}

function parseString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing ${name}.`)
  }

  return value
}

function parseFormat(value: unknown): 'markdown' | 'json' {
  if (value === 'markdown' || value === 'json') {
    return value
  }

  throw new Error(`Invalid catalog format: ${String(value)}`)
}

function parseReports(value: unknown): readonly ZflowExecutionReport[] {
  if (!Array.isArray(value)) {
    throw new Error('Missing reports array.')
  }

  return value.map((report, index) => {
    if (typeof report !== 'object' || report === null) {
      throw new Error(`Report ${index + 1} must be an object.`)
    }

    return report as ZflowExecutionReport
  })
}

function parseZflowReportCatalogToolInput(input: unknown): ZflowReportCatalogToolInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing zflow report catalog input.')
  }

  const obj = input as Record<string, unknown>
  const generatedAt = obj['generatedAt']

  if (generatedAt !== undefined && typeof generatedAt !== 'string') {
    throw new Error('generatedAt must be a string when supplied.')
  }

  return {
    title: parseString(obj['title'], 'title'),
    format: parseFormat(obj['format']),
    reports: parseReports(obj['reports']),
    ...(generatedAt !== undefined ? { generatedAt } : {}),
  }
}

export const zflowReportCatalogTool: RuntimeToolDefinition = {
  name: 'zflow_report_catalog',
  description: 'Render a Zflow report catalog as markdown or JSON artifact manifest.',
  capability: 'ZFLOW_REPORT_CATALOG',
  execute: async (input: unknown, _context: RuntimeToolContext): Promise<string> => {
    const parsed = parseZflowReportCatalogToolInput(input)
    const catalog = createZflowReportCatalog({
      title: parsed.title,
      reports: parsed.reports,
      ...(parsed.generatedAt !== undefined ? { generatedAt: parsed.generatedAt } : {}),
    })

    if (parsed.format === 'json') {
      return renderZflowReportArtifactManifestJson(createZflowReportArtifactManifest(catalog))
    }

    return renderZflowReportCatalogMarkdown(catalog)
  },
}
