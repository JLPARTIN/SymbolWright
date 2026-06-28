import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'

export async function renderRuntimeLiveReadPolicy(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const registry = createFixtureRegistry('live_read_policy')
  const tool = registry.getOrThrow('live_read_policy_handshake')

  return tool.execute({ path: fixturePath }, createFixtureContext(cwd))
}
