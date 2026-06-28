import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'

export async function renderRuntimeValidationPlan(
  focus: string | undefined,
  cwd: string = process.cwd(),
): Promise<string> {
  const registry = createFixtureRegistry('read_only')
  const tool = registry.getOrThrow('validation_plan')

  return tool.execute({ focus }, createFixtureContext(cwd))
}
