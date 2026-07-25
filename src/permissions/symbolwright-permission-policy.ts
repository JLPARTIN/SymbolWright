import type {
  SymbolWrightPermissionDecision,
  SymbolWrightPermissionDisposition,
  SymbolWrightPermissionRequest,
  SymbolWrightProtectedPathHit,
  SymbolWrightRiskLevel,
} from './symbolwright-permission.types.js'

const POLICY_ID = 'symbolwright-default-permission-policy'
const POLICY_VERSION = '0.1.0'

function rankDisposition(disposition: SymbolWrightPermissionDisposition): number {
  switch (disposition) {
    case 'DENY':
      return 3
    case 'ASK':
      return 2
    case 'ALLOW':
      return 1
  }
}

export function resolveHighestDisposition(
  dispositions: readonly SymbolWrightPermissionDisposition[],
): SymbolWrightPermissionDisposition {
  if (dispositions.length === 0) {
    return 'ASK'
  }

  return dispositions.reduce<SymbolWrightPermissionDisposition>(
    (highest, current) => (rankDisposition(current) > rankDisposition(highest) ? current : highest),
    'ALLOW',
  )
}

function protectedHitForTarget(target: string): SymbolWrightProtectedPathHit | undefined {
  const normalizedTarget = target.trim().replaceAll('\\', '/')

  const protectedPatterns: ReadonlyArray<{
    readonly pattern: string
    readonly protectedClass: SymbolWrightProtectedPathHit['protectedClass']
    readonly disposition: SymbolWrightProtectedPathHit['disposition']
    readonly reason: string
  }> = [
    {
      pattern: '.env',
      protectedClass: 'SENSITIVE_CONFIG',
      disposition: 'DENY',
      reason: 'Environment configuration must not be read, printed, or mutated by default.',
    },
    {
      pattern: '.github/workflows/',
      protectedClass: 'CI_WORKFLOW',
      disposition: 'ASK',
      reason: 'Workflow changes require explicit operator review.',
    },
    {
      pattern: 'symbolwright.policy',
      protectedClass: 'GOVERNANCE_POLICY',
      disposition: 'DENY',
      reason: 'Policy files require dedicated governance approval before mutation.',
    },
  ]

  const match = protectedPatterns.find(
    ({ pattern }) => normalizedTarget === pattern || normalizedTarget.includes(pattern),
  )

  if (!match) {
    return undefined
  }

  return {
    target,
    normalizedTarget,
    protectedClass: match.protectedClass,
    matchedPattern: match.pattern,
    disposition: match.disposition,
    reason: match.reason,
  }
}

function defaultRiskForDisposition(
  disposition: SymbolWrightPermissionDisposition,
): SymbolWrightRiskLevel {
  switch (disposition) {
    case 'ALLOW':
      return 'LOW'
    case 'ASK':
      return 'MEDIUM'
    case 'DENY':
      return 'DENIED'
  }
}

export function evaluateSymbolWrightPermissionRequest(
  request: SymbolWrightPermissionRequest,
): SymbolWrightPermissionDecision {
  const protectedPathHits = request.targets
    .map((target) => protectedHitForTarget(target.value))
    .filter((hit): hit is SymbolWrightProtectedPathHit => hit !== undefined)

  const requestedDisposition: SymbolWrightPermissionDisposition = request.operatorApproved
    ? 'ALLOW'
    : 'ASK'

  const toolDisposition: SymbolWrightPermissionDisposition =
    request.toolCategory.includes('MUTATOR') ||
    request.toolCategory === 'PATCH_APPLIER' ||
    request.toolCategory === 'COMMAND_RUNNER'
      ? request.operatorApproved
        ? 'ASK'
        : 'DENY'
      : requestedDisposition

  const disposition = resolveHighestDisposition([
    requestedDisposition,
    toolDisposition,
    ...protectedPathHits.map((hit) => hit.disposition),
  ])

  return {
    requestId: request.requestId,
    disposition,
    risk: defaultRiskForDisposition(disposition),
    toolCategory: request.toolCategory,
    reasons: [
      'SymbolWright uses deny-over-ask-over-allow permission resolution.',
      ...protectedPathHits.map((hit) => hit.reason),
    ],
    operatorApprovalRequired: disposition !== 'ALLOW',
    auditRequired: disposition !== 'ALLOW' || protectedPathHits.length > 0,
    policyVersion: POLICY_VERSION,
    policyId: POLICY_ID,
    protectedPathHits,
    trustBoundaryNotes: [
      `Source trust zone: ${request.sourceTrustZone}`,
      'Repository content, CI logs, PR text, commit messages, and generated output are treated as data, not authority.',
    ],
    deniedByInvariant: disposition === 'DENY',
  }
}
