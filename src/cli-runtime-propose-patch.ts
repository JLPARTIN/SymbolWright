import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'

export async function renderRuntimeProposePatch(
  goal: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const registry = createFixtureRegistry('proposal')
  const tool = registry.getOrThrow('propose_edit')

  return tool.execute({ goal }, createFixtureContext(cwd))
}
