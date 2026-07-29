import type { RuntimeToolContext } from '../types.js'

/**
 * Legacy direct web research is a trusted local-operator surface. Delegated agents must use the
 * separately authorized SandboxNetworkGateway so arbitrary public fetch/search cannot bypass the
 * brokered egress capability and its DNS, quota, audit, and revision controls.
 */
export function assertTrustedOperatorResearchNetwork(
  context: RuntimeToolContext,
  toolName: 'web_fetch' | 'web_search',
): void {
  if (
    context.accessControl !== undefined ||
    (context.sandboxAuthorization !== undefined &&
      context.sandboxAuthorization.callerKind !== 'operator')
  ) {
    throw new Error(
      `authorization_denied[BROKERED_EGRESS_REQUIRED]: ${toolName} direct network access is restricted to the trusted local operator. Delegated callers must use SandboxNetworkGateway with symbolwright.sandbox.egress authority.`,
    )
  }
}
