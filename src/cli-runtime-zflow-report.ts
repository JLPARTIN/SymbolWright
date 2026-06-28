import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'
import {
  assertRecord,
  loadFixtureFile,
  parseFixtureFormat,
} from './runtime/workflow/runtime-report-fixture-guards.js'
import type { ZflowReadinessSummary } from './runtime/workflow/zflow-handoff.js'
import type { ZflowResult } from './runtime/workflow/zflow-workflow.js'

export interface ZflowReportFixtureRequest {
  readonly id: string
  readonly format: 'markdown' | 'json'
  readonly result: ZflowResult
  readonly readiness: ZflowReadinessSummary
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
    format: parseFixtureFormat(raw['format']),
    result: result as unknown as ZflowResult,
    readiness: readiness as unknown as ZflowReadinessSummary,
  }
}

export async function renderRuntimeZflowReport(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const raw = loadFixtureFile(fixturePath)
  const fixture = parseFixture(raw)
  const registry = createFixtureRegistry('zflow_report')
  const context = createFixtureContext(cwd)

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
