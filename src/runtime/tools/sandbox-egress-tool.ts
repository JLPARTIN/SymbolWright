import {
  parseGovernedEgressRequest,
  renderGovernedEgressResult,
  requestGovernedEgress,
  type GovernedEgressRequest,
} from '../../sandbox/governed-egress.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'

export async function executeSandboxEgressTool(
  request: GovernedEgressRequest,
  context: RuntimeToolContext,
): Promise<string> {
  if (context.policy.mode !== 'APPROVED_EXECUTION') {
    throw new Error('sandbox_egress_request requires APPROVED_EXECUTION mode.')
  }
  if (context.sandboxNetworkRuntime === undefined) {
    throw new Error('The application-owned sandbox network runtime is unavailable.')
  }
  if (context.sandboxEgressAuthorization === undefined) {
    throw new Error('No server-derived egress policy reference is authorized for this workspace.')
  }
  const result = await requestGovernedEgress({
    runtime: context.sandboxNetworkRuntime,
    authorization: context.sandboxEgressAuthorization,
    request,
  })
  await context.recordEgressRequest?.(result)
  return renderGovernedEgressResult(result)
}

export const sandboxEgressRequestTool: RuntimeToolDefinition = {
  name: 'sandbox_egress_request',
  description:
    'Perform a bounded HTTPS request through SymbolWright’s operator-owned egress profile, DNS/SSRF defenses, quotas, cancellation, revision checks, and durable redacted audit. The caller cannot supply policy, approvals, grant identity, resolver state, proxy settings, pinned addresses, or container networking.',
  capability: 'WEB_ACCESS',
  execute: async (input, context) =>
    executeSandboxEgressTool(parseGovernedEgressRequest(input), context),
}
