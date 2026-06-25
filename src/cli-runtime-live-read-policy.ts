import {
  createLiveReadPolicyRuntimeContext,
  createLiveReadPolicyRuntimeRegistry,
} from './runtime/runtime-live-read-policy-registry.js'

export async function renderRuntimeLiveReadPolicy(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const registry = createLiveReadPolicyRuntimeRegistry()
  const tool = registry.getOrThrow('live_read_policy_handshake')

  return tool.execute({ path: fixturePath }, createLiveReadPolicyRuntimeContext(cwd))
}
