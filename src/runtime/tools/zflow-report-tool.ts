import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import {
  createZflowExecutionReport,
  renderZflowReportJson,
  renderZflowReportMarkdown,
} from '../workflow/zflow-report.js'
import type { ZflowHandoffPacket, ZflowReadinessSummary } from '../workflow/zflow-handoff.js'
import type { ZflowResult } from '../workflow/zflow-workflow.js'

export interface ZflowReportToolInput {
  readonly id: string
  readonly format: 'markdown' | 'json'
  readonly result: ZflowResult
  readonly readiness: ZflowReadinessSummary
}

function parseString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing ${name}.`)
  }

  return value
}

function parseOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== 'string') {
    throw new Error('Optional report output value must be a string when supplied.')
  }

  return value
}

function parseReasons(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error('Missing readiness reasons.')
  }

  return value.map((item, index) => {
    if (typeof item !== 'string') {
      throw new Error(`Readiness reason ${index + 1} must be a string.`)
    }

    return item
  })
}

function parseReadiness(value: unknown): ZflowReadinessSummary {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Missing readiness summary.')
  }

  const obj = value as Record<string, unknown>
  const readiness = parseString(obj['readiness'], 'readiness')

  if (
    readiness !== 'READY_FOR_OPERATOR_REVIEW' &&
    readiness !== 'NEEDS_RECOVERY_DETAIL' &&
    readiness !== 'BLOCKED'
  ) {
    throw new Error(`Invalid readiness: ${readiness}`)
  }

  return {
    readiness,
    reasons: parseReasons(obj['reasons']),
  }
}

function parseResult(value: unknown): ZflowResult {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Missing zflow result.')
  }

  const obj = value as Record<string, unknown>
  const mode = parseString(obj['mode'], 'mode')

  if (
    mode !== 'preview-only' &&
    mode !== 'local-apply' &&
    mode !== 'local-apply-and-validate' &&
    mode !== 'prepare-pr'
  ) {
    throw new Error(`Invalid zflow mode: ${mode}`)
  }

  return {
    mode,
    localOutput: parseString(obj['localOutput'], 'localOutput'),
    prOutput: parseOptionalString(obj['prOutput']),
    collaborationOutput: parseOptionalString(obj['collaborationOutput']),
    recoveryOutput: parseString(obj['recoveryOutput'], 'recoveryOutput'),
    rollbackOutput: parseString(obj['rollbackOutput'], 'rollbackOutput'),
  }
}

function parseZflowReportToolInput(input: unknown): ZflowReportToolInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing zflow report input.')
  }

  const obj = input as Record<string, unknown>
  const format = parseString(obj['format'], 'format')

  if (format !== 'markdown' && format !== 'json') {
    throw new Error(`Invalid report format: ${format}`)
  }

  return {
    id: parseString(obj['id'], 'id'),
    format,
    result: parseResult(obj['result']),
    readiness: parseReadiness(obj['readiness']),
  }
}

function createHandoffForReport(input: ZflowReportToolInput): ZflowHandoffPacket {
  return {
    summary: input.readiness,
    packet: {
      id: `${input.id}-packet`,
      timestamp: new Date().toISOString(),
      sourceEvidence: [],
      proposedAction: 'create_pr',
      actionDetail: 'Review exported Zflow report.',
      risks: [],
      validation: input.readiness.reasons,
      boundary: ['Report export only.', 'No live mutation.'],
      nextManualStep: 'Review the exported report.',
    },
  }
}

export const zflowReportTool: RuntimeToolDefinition = {
  name: 'zflow_report',
  description: 'Render a Zflow execution report as markdown or JSON.',
  capability: 'ZFLOW_REPORT',
  execute: async (input: unknown, _context: RuntimeToolContext): Promise<string> => {
    const parsed = parseZflowReportToolInput(input)
    const report = createZflowExecutionReport({
      id: parsed.id,
      result: parsed.result,
      handoff: createHandoffForReport(parsed),
    })

    return parsed.format === 'json'
      ? renderZflowReportJson(report)
      : renderZflowReportMarkdown(report)
  },
}
