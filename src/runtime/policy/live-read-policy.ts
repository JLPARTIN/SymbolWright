export type LiveReadProvider = 'github'

export interface LiveReadPolicyRequest {
  readonly provider: LiveReadProvider
  readonly purpose: string
  readonly scopes: readonly string[]
  readonly dryRun: boolean
}

export interface LiveReadPolicyDecision {
  readonly allowed: boolean
  readonly reason: string
  readonly requestedScopes: readonly string[]
  readonly requiredBoundary: readonly string[]
}

const ALLOWED_SCOPES = ['pr:read', 'checks:read', 'contents:read'] as const

export function evaluateLiveReadPolicy(request: LiveReadPolicyRequest): LiveReadPolicyDecision {
  if (request.provider !== 'github') {
    return block(request.scopes, 'unsupported provider')
  }

  if (!request.dryRun) {
    return block(request.scopes, 'live read handshake requires dryRun=true')
  }

  if (request.purpose.trim().length === 0) {
    return block(request.scopes, 'purpose is required')
  }

  const disallowed = request.scopes.filter(
    (scope) => !ALLOWED_SCOPES.includes(scope as (typeof ALLOWED_SCOPES)[number]),
  )
  if (disallowed.length > 0) {
    return block(request.scopes, `disallowed scopes: ${disallowed.join(', ')}`)
  }

  return {
    allowed: true,
    reason: 'live read policy handshake accepted for dry-run planning',
    requestedScopes: request.scopes,
    requiredBoundary: liveReadBoundary(),
  }
}

function block(scopes: readonly string[], reason: string): LiveReadPolicyDecision {
  return {
    allowed: false,
    reason,
    requestedScopes: scopes,
    requiredBoundary: liveReadBoundary(),
  }
}

export function liveReadBoundary(): readonly string[] {
  return [
    'read-only adapter handshake only',
    'no service call is performed',
    'no comments are posted',
    'no approvals are submitted',
    'no merges are performed',
    'no branches are pushed',
    'no workflow reruns are requested',
  ]
}
