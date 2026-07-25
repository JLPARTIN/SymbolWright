import { DEFAULT_RUNTIME_PROTECTED_PATHS } from '../runtime/policy/runtime-policy.js'
import type {
  SymbolWrightPermissionDecision,
  SymbolWrightPermissionDisposition,
  SymbolWrightPermissionRequest,
  SymbolWrightProtectedPathClass,
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

interface ProtectedPathPattern {
  readonly pattern: string
  readonly protectedClass: SymbolWrightProtectedPathHit['protectedClass']
  readonly disposition: SymbolWrightProtectedPathHit['disposition']
  readonly reason: string
}

const RUNTIME_PROTECTED_PATH_METADATA: Readonly<
  Record<
    (typeof DEFAULT_RUNTIME_PROTECTED_PATHS)[number],
    { readonly protectedClass: SymbolWrightProtectedPathClass; readonly reason: string }
  >
> = {
  '.git': {
    protectedClass: 'GIT_INTERNAL',
    reason: 'Git internals must not be read or mutated directly by tools.',
  },
  '.symbolwright': {
    protectedClass: 'UNKNOWN_PROTECTED',
    reason: "SymbolWright's own mission/checkpoint state must not be read or mutated by tools.",
  },
  '.codemind': {
    protectedClass: 'UNKNOWN_PROTECTED',
    reason:
      "SymbolWright's legacy (pre-rebrand) mission/checkpoint state must not be read or mutated by tools.",
  },
  '.env': {
    protectedClass: 'SENSITIVE_CONFIG',
    reason: 'Environment configuration must not be read, printed, or mutated by default.',
  },
  '.env.local': {
    protectedClass: 'SENSITIVE_CONFIG',
    reason: 'Environment configuration must not be read, printed, or mutated by default.',
  },
  node_modules: {
    protectedClass: 'UNKNOWN_PROTECTED',
    reason: 'Third-party dependency trees are excluded from read/write tooling.',
  },
  dist: {
    protectedClass: 'UNKNOWN_PROTECTED',
    reason: 'Build output is excluded from read/write tooling.',
  },
  coverage: {
    protectedClass: 'UNKNOWN_PROTECTED',
    reason: 'Coverage output is excluded from read/write tooling.',
  },
}

/**
 * Every path `DEFAULT_RUNTIME_PROTECTED_PATHS` blocks at the runtime
 * read/write-tool level is deny-listed here too, so this policy's
 * protected-path set is a provable superset of the single canonical list
 * instead of a separately hand-maintained one that can silently diverge
 * from it (which is exactly what had happened -- this list used to omit
 * `.git`, `.symbolwright`/`.codemind`, `node_modules`, `dist`, and
 * `coverage` entirely).
 */
const RUNTIME_PROTECTED_PATH_PATTERNS: readonly ProtectedPathPattern[] =
  DEFAULT_RUNTIME_PROTECTED_PATHS.map((pattern) => ({
    pattern,
    protectedClass: RUNTIME_PROTECTED_PATH_METADATA[pattern].protectedClass,
    disposition: 'DENY',
    reason: RUNTIME_PROTECTED_PATH_METADATA[pattern].reason,
  }))

/**
 * Patterns specific to this policy's PR/CI-governance context. These aren't
 * blocked at the runtime read/write-tool level (a workflow file is a normal,
 * readable/writable repository file to `edit_file`), so they don't belong in
 * `DEFAULT_RUNTIME_PROTECTED_PATHS` -- they still need the graduated
 * ASK/DENY handling only this policy expresses.
 */
const GOVERNANCE_PROTECTED_PATH_PATTERNS: readonly ProtectedPathPattern[] = [
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

const PROTECTED_PATH_PATTERNS: readonly ProtectedPathPattern[] = [
  ...RUNTIME_PROTECTED_PATH_PATTERNS,
  ...GOVERNANCE_PROTECTED_PATH_PATTERNS,
]

/**
 * A bare pattern (no `/`) matches only a whole path segment, e.g. `.git`
 * matches `.git/config` but not `.github/workflows/ci.yml` -- naive
 * substring matching would falsely treat `.github` as containing `.git`. A
 * pattern that already contains `/` (e.g. `.github/workflows/`) keeps
 * substring matching, since that's a deliberate directory-prefix match.
 */
function matchesProtectedPattern(normalizedTarget: string, pattern: string): boolean {
  if (pattern.includes('/')) {
    return normalizedTarget === pattern || normalizedTarget.includes(pattern)
  }

  const segments = normalizedTarget.split('/').filter(Boolean)
  return normalizedTarget === pattern || segments.includes(pattern)
}

function protectedHitForTarget(target: string): SymbolWrightProtectedPathHit | undefined {
  const normalizedTarget = target.trim().replaceAll('\\', '/')

  const match = PROTECTED_PATH_PATTERNS.find(({ pattern }) =>
    matchesProtectedPattern(normalizedTarget, pattern),
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
