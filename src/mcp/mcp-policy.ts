import type { RuntimePolicySnapshot } from '../runtime/types.js'

/**
 * MCP tool calls spawn local subprocesses, the same risk tier as `bash`/`git`
 * execution — so they're gated by the existing `allowShell` policy flag rather
 * than introducing a parallel policy dimension for one runtime surface.
 */
export function assertMcpAllowed(policy: RuntimePolicySnapshot): void {
  if (!policy.allowShell) {
    throw new Error('MCP tool execution is disabled by runtime policy.')
  }
}
