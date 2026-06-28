import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'

export async function renderRuntimePlan(
  goal: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const registry = createFixtureRegistry('read_only')
  const tool = registry.getOrThrow('plan_goal')

  return tool.execute({ goal }, createFixtureContext(cwd))
}
