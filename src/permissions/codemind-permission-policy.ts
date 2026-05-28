import type {
  CodemindPermissionDecision,
  CodemindPermissionDisposition,
  CodemindPermissionRequest,
  CodemindProtectedPathHit,
  CodemindRiskLevel,
} from './codemind-permission.types.js';

const POLICY_ID = 'codemind-default-permission-policy';
const POLICY_VERSION = '0.1.0';

function rankDisposition(disposition: CodemindPermissionDisposition): number {
  switch (disposition) {
    case 'DENY':
      return 3;
    case 'ASK':
      return 2;
    case 'ALLOW':
      return 1;
  }
}

export function resolveHighestDisposition(
  dispositions: readonly CodemindPermissionDisposition[],
): CodemindPermissionDisposition {
  if (dispositions.length === 0) {
    return 'ASK';
  }

  return dispositions.reduce<CodemindPermissionDisposition>(
    (highest, current) =>
      rankDisposition(current) > rankDisposition(highest) ? current : highest,
    'ALLOW',
  );
}

function protectedHitForTarget(target: string): CodemindProtectedPathHit | undefined {
  const normalizedTarget = target.trim().replaceAll('\\', '/');

  const protectedPatterns: ReadonlyArray<{
    readonly pattern: string;
    readonly protectedClass: CodemindProtectedPathHit['protectedClass'];
    readonly disposition: CodemindProtectedPathHit['disposition'];
    readonly reason: string;
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
      pattern: 'codemind.policy',
      protectedClass: 'GOVERNANCE_POLICY',
      disposition: 'DENY',
      reason: 'Policy files require dedicated governance approval before mutation.',
    },
  ];

  const match = protectedPatterns.find(({ pattern }) =>
    normalizedTarget === pattern || normalizedTarget.includes(pattern),
  );

  if (!match) {
    return undefined;
  }

  return {
    target,
    normalizedTarget,
    protectedClass: match.protectedClass,
    matchedPattern: match.pattern,
    disposition: match.disposition,
    reason: match.reason,
  };
}

function defaultRiskForDisposition(
  disposition: CodemindPermissionDisposition,
): CodemindRiskLevel {
  switch (disposition) {
    case 'ALLOW':
      return 'LOW';
    case 'ASK':
      return 'MEDIUM';
    case 'DENY':
      return 'DENIED';
  }
}

export function evaluateCodemindPermissionRequest(
  request: CodemindPermissionRequest,
): CodemindPermissionDecision {
  const protectedPathHits = request.targets
    .map((target) => protectedHitForTarget(target.value))
    .filter((hit): hit is CodemindProtectedPathHit => hit !== undefined);

  const requestedDisposition: CodemindPermissionDisposition =
    request.operatorApproved ? 'ALLOW' : 'ASK';

  const toolDisposition: CodemindPermissionDisposition =
    request.toolCategory.includes('MUTATOR') ||
    request.toolCategory === 'PATCH_APPLIER' ||
    request.toolCategory === 'COMMAND_RUNNER'
      ? request.operatorApproved
        ? 'ASK'
        : 'DENY'
      : requestedDisposition;

  const disposition = resolveHighestDisposition([
    requestedDisposition,
    toolDisposition,
    ...protectedPathHits.map((hit) => hit.disposition),
  ]);

  return {
    requestId: request.requestId,
    disposition,
    risk: defaultRiskForDisposition(disposition),
    toolCategory: request.toolCategory,
    reasons: [
      'CodeMind uses deny-over-ask-over-allow permission resolution.',
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
  };
}
