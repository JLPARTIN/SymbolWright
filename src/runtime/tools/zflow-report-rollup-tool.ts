import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import type { ZflowReportCatalog } from '../workflow/zflow-report-catalog.js'
import {
  createZflowReportSuite,
  renderZflowReportSuiteJson,
  renderZflowReportSuiteMarkdown,
} from '../workflow/zflow-report-suite.js'

export interface ZflowReportRollupToolInput {
  readonly title: string
  readonly format: 'markdown' | 'json'
  readonly catalog: ZflowReportCatalog
  readonly generatedAt?: string
}

function readString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing ${name}.`)
  }
  return value
}

function readFormat(value: unknown): 'markdown' | 'json' {
  if (value === 'markdown' || value === 'json') {
    return value
  }
  throw new Error(`Invalid rollup format: ${String(value)}`)
}

function readCatalog(value: unknown): ZflowReportCatalog {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Missing catalog object.')
  }
  return value as ZflowReportCatalog
}

function readInput(input: unknown): ZflowReportRollupToolInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing zflow report rollup input.')
  }

  const obj = input as Record<string, unknown>
  const generatedAt = obj['generatedAt']

  if (generatedAt !== undefined && typeof generatedAt !== 'string') {
    throw new Error('generatedAt must be a string when supplied.')
  }

  return {
    title: readString(obj['title'], 'title'),
    format: readFormat(obj['format']),
    catalog: readCatalog(obj['catalog']),
    ...(generatedAt !== undefined ? { generatedAt } : {}),
  }
}

export const zflowReportRollupTool: RuntimeToolDefinition = {
  name: 'zflow_report_rollup',
  description: 'Render a Zflow report rollup as markdown or JSON.',
  capability: 'ZFLOW_REPORT_CATALOG',
  execute: async (input: unknown, _context: RuntimeToolContext): Promise<string> => {
    const parsed = readInput(input)
    const suite = createZflowReportSuite({
      title: parsed.title,
      catalog: parsed.catalog,
      ...(parsed.generatedAt !== undefined ? { generatedAt: parsed.generatedAt } : {}),
    })

    return parsed.format === 'json'
      ? renderZflowReportSuiteJson(suite)
      : renderZflowReportSuiteMarkdown(suite)
  },
}
