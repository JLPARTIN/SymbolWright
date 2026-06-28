import { readFile } from 'node:fs/promises'
import type { CodemindToolName } from './runtime/types.js'
import type { FakeLiveReadClientData } from './runtime/live-read/fake-live-read-client.js'
import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'
import {
  runRuntimeWorkflow,
  renderWorkflowResult,
  type RuntimeWorkflowStep,
  type RuntimeWorkflowRequest,
} from './runtime/workflow/runtime-workflow.js'

export async function renderRuntimeWorkflow(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const raw = await readFile(fixturePath, 'utf-8')
  const parsed: Record<string, unknown> = JSON.parse(raw) as Record<string, unknown>

  const name = parsed['name']
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Missing or invalid workflow name.')
  }

  const rawSteps = parsed['steps']
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    throw new Error('Missing or empty steps array.')
  }

  const steps: RuntimeWorkflowStep[] = rawSteps.map((rawStep: unknown, index: number) => {
    const step = rawStep as Record<string, unknown>
    const toolName = step['toolName']
    if (typeof toolName !== 'string' || toolName.trim().length === 0) {
      throw new Error(`Step ${index + 1}: missing or invalid toolName.`)
    }

    const input = step['input']
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new Error(`Step ${index + 1}: missing or invalid input object.`)
    }

    return {
      toolName: toolName as CodemindToolName,
      input: input as Record<string, unknown>,
    }
  })

  const rawMaxSteps = parsed['maxSteps']
  const maxSteps = typeof rawMaxSteps === 'number' && rawMaxSteps > 0 ? rawMaxSteps : undefined

  const request: RuntimeWorkflowRequest =
    maxSteps !== undefined ? { name, steps, maxSteps } : { name, steps }

  const rawClientData = parsed['clientData']
  const clientData: FakeLiveReadClientData =
    typeof rawClientData === 'object' && rawClientData !== null && !Array.isArray(rawClientData)
      ? (rawClientData as FakeLiveReadClientData)
      : {}

  const registry = createFixtureRegistry('workflow', clientData)
  const context = createFixtureContext(cwd)
  const result = await runRuntimeWorkflow(request, registry, context)

  return renderWorkflowResult(result)
}
