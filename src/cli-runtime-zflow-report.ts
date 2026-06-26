import fs from 'node:fs'

import {
  createZflowReportRuntimeContext,
  createZflowReportRuntimeRegistry,
} from './runtime/runtime-zflow-report-registry.js'
import type { ZflowReadinessSummary } from './runtime/workflow/zflow-handoff.js'
import type { ZflowResult } from './runtime/workflow/zflow-workflow.js'

export interface ZflowReportFixtureRequest {
  readonly id: string
  readonly format: 'markdown' | 'json'
  readonly result: ZflowResult
  readonly readiness: ZflowReadinessSummary
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

function parseFixture(raw: unknown): ZflowReportFixtureRequest {
  assertRecord(raw, 'Fixture must be a JSON object.')

  const id = raw['id']
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "id" field.')
  }

  const result = raw['result']
  const readiness = raw['readiness']
  assertRecord(result, 'Fixture must include a "result" object.')
  assertRecord(readiness, 'Fixture must include a "readiness" object.')

  return {
    id,
    format: parseFormat(raw['format']),
    result: result as unknown as ZflowResult,
    readiness: readiness as unknown as ZflowReadinessSummary,
  }
}

export async function renderRuntimeZflowReport(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as unknown
  const fixture = parseFixture(raw)
  const registry = createZflowReportRuntimeRegistry()
  const context = createZflowReportRuntimeContext(cwd)

  const tool = registry.getOrThrow('zflow_report')
  return tool.execute(
    {
      id: fixture.id,
      format: fixture.format,
      result: fixture.result,
      readiness: fixture.readiness,
    },
    context,
  )
}
