import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'

export async function renderRuntimePrNotes(
  focus: string | undefined,
  cwd: string = process.cwd(),
): Promise<string> {
  const registry = createFixtureRegistry('proposal')
  const tool = registry.getOrThrow('pr_notes')

  return tool.execute({ focus }, createFixtureContext(cwd))
}
