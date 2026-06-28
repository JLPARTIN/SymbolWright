import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'

export async function renderRuntimeRead(
  path: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const registry = createFixtureRegistry('read_only')
  const tool = registry.getOrThrow('read_file')

  return tool.execute({ path }, createFixtureContext(cwd))
}
