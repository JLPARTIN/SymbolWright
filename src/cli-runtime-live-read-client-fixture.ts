import {
  createLiveReadClientRuntimeContext,
  createLiveReadClientRuntimeRegistry,
} from './runtime/runtime-live-read-client-registry.js'

export async function renderRuntimeLiveReadClientFixture(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const registry = createLiveReadClientRuntimeRegistry()
  const tool = registry.getOrThrow('live_read_client_fixture')

  return tool.execute({ path: fixturePath }, createLiveReadClientRuntimeContext(cwd))
}
