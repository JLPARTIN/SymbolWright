import type {
  CodemindPermissionDecision,
  CodemindPermissionRequest,
  CodemindMode,
  CodemindTrustZone,
} from '../permissions/codemind-permission.types.js'
import { evaluateCodemindPermissionRequest } from '../permissions/codemind-permission-policy.js'
import type { RuntimePolicySnapshot } from '../runtime/types.js'

export const PROVIDER_INVOCATION_TOOL_CATEGORY = 'PROVIDER_INVOCATION' as const

export interface ProviderPolicyGateRequest {
  readonly requestId: string
  readonly sessionId: string
  readonly mode: CodemindMode
  readonly providerLabel: string
  readonly model: string
  readonly sourceTrustZone: CodemindTrustZone
  readonly operatorApproved: boolean
  readonly approvalRecordId?: string
}

export interface ProviderPolicyGateDecision {
  readonly requestId: string
  readonly allowed: boolean
  readonly permissionDecision: CodemindPermissionDecision
  readonly blockedReasons: readonly string[]
}

export function evaluateProviderPolicyGate(
  request: ProviderPolicyGateRequest,
  policy: RuntimePolicySnapshot,
): ProviderPolicyGateDecision {
  const blockedReasons: string[] = []

  if (!policy.allowNetwork) {
    blockedReasons.push(
      'Runtime policy does not allow network access. Provider invocation requires allowNetwork.',
    )
  }

  const permissionRequest: CodemindPermissionRequest = {
    requestId: request.requestId,
    sessionId: request.sessionId,
    mode: request.mode,
    toolCategory: 'NETWORK_READER',
    action: `provider-invocation:${request.providerLabel}:${request.model}`,
    targets: [
      {
        kind: 'network-resource',
        value: `provider:${request.providerLabel}`,
      },
    ],
    sourceTrustZone: request.sourceTrustZone,
    operatorApproved: request.operatorApproved,
    ...(request.approvalRecordId !== undefined
      ? { approvalRecordId: request.approvalRecordId }
      : {}),
  }

  const permissionDecision = evaluateCodemindPermissionRequest(permissionRequest)

  if (permissionDecision.disposition === 'DENY') {
    blockedReasons.push(
      `Permission policy denied provider invocation: ${permissionDecision.reasons.join('; ')}`,
    )
  }

  const allowed = blockedReasons.length === 0 && permissionDecision.disposition === 'ALLOW'

  return {
    requestId: request.requestId,
    allowed,
    permissionDecision,
    blockedReasons,
  }
}
