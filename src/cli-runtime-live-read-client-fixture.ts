import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'

export async function renderRuntimeLiveReadClientFixture(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const registry = createFixtureRegistry('live_read_client')
  const tool = registry.getOrThrow('live_read_client_fixture')

  return tool.execute({ path: fixturePath }, createFixtureContext(cwd))
}
