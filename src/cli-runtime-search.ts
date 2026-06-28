import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'

export async function renderRuntimeSearch(
  query: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const registry = createFixtureRegistry('read_only')
  const tool = registry.getOrThrow('search_files')

  return tool.execute({ query }, createFixtureContext(cwd))
}
