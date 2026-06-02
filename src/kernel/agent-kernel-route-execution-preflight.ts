import type {
  AgentKernelProviderRoutePlan,
  AgentKernelProviderRouteType,
} from './agent-kernel-provider-routing-gateway.js'

export const AGENT_KERNEL_ROUTE_PREFLIGHT_BLOCK_ID = 'AGENT-KERNEL-06' as const
export const AGENT_KERNEL_ROUTE_PREFLIGHT_PR_ID = 'PR-AK-06' as const
export const AGENT_KERNEL_ROUTE_PREFLIGHT_PHASE_ID = 'Phase-16G-AK-06' as const

export const AGENT_KERNEL_ROUTE_PREFLIGHT_FINDING_CODES = [
  'ROUTE_NOT_READY',
  'PROVIDER_ALREADY_INVOKED',
  'ROUTE_TYPE_BLOCKED',
  'EXTERNAL_ROUTE_REQUIRES_APPROVAL',
  'ROUTE_FINDINGS_BLOCKING',
  'PREFLIGHT_ACCEPTED',
] as const
export type AgentKernelRoutePreflightFindingCode =
  (typeof AGENT_KERNEL_ROUTE_PREFLIGHT_FINDING_CODES)[number]

export const AGENT_KERNEL_ROUTE_PREFLIGHT_SEVERITIES = ['INFO', 'ASK', 'BLOCK'] as const
export type AgentKernelRoutePreflightSeverity =
  (typeof AGENT_KERNEL_ROUTE_PREFLIGHT_SEVERITIES)[number]

export interface AgentKernelRouteExecutionPolicy {
  readonly allowedRouteTypes: readonly AgentKernelProviderRouteType[]
  readonly allowExternalProviderRoutes: boolean
  readonly operatorApprovedExternalRoute: boolean
  readonly blockOnRouteWarnings: boolean
}

export interface AgentKernelRoutePreflightFinding {
  readonly code: AgentKernelRoutePreflightFindingCode
  readonly severity: AgentKernelRoutePreflightSeverity
  readonly message: string
}

export interface AgentKernelRouteExecutionPreflightDecision {
  readonly blockId: typeof AGENT_KERNEL_ROUTE_PREFLIGHT_BLOCK_ID
  readonly prId: typeof AGENT_KERNEL_ROUTE_PREFLIGHT_PR_ID
  readonly phaseId: typeof AGENT_KERNEL_ROUTE_PREFLIGHT_PHASE_ID
  readonly packetId: string
  readonly routeType: AgentKernelProviderRouteType
  readonly accepted: boolean
  readonly executionReady: boolean
  readonly providerInvoked: false
  readonly repoMutationAllowed: false
  readonly commandExecutionAllowed: false
  readonly findings: readonly AgentKernelRoutePreflightFinding[]
  readonly rationale: readonly string[]
}

function makeFinding(
  code: AgentKernelRoutePreflightFindingCode,
  severity: AgentKernelRoutePreflightSeverity,
  message: string,
): AgentKernelRoutePreflightFinding {
  return { code, severity, message }
}

function isExternalRoute(routeType: AgentKernelProviderRouteType): boolean {
  return (
    routeType === 'LIGHTWEIGHT_REASONING' ||
    routeType === 'DEEP_REASONING' ||
    routeType === 'AUDIT_REVIEW'
  )
}

export function preflightAgentKernelRouteExecution(
  routePlan: AgentKernelProviderRoutePlan,
  policy: AgentKernelRouteExecutionPolicy,
): AgentKernelRouteExecutionPreflightDecision {
  const findings: AgentKernelRoutePreflightFinding[] = []
  const rationale: string[] = []

  if (!routePlan.providerRouteReady) {
    findings.push(
      makeFinding(
        'ROUTE_NOT_READY',
        'BLOCK',
        'Provider route plan is not ready for execution preflight.',
      ),
    )
  }

  if (routePlan.providerInvoked) {
    findings.push(
      makeFinding(
        'PROVIDER_ALREADY_INVOKED',
        'BLOCK',
        'Route plan indicates a provider was already invoked.',
      ),
    )
  }

  if (!policy.allowedRouteTypes.includes(routePlan.routeType)) {
    findings.push(
      makeFinding(
        'ROUTE_TYPE_BLOCKED',
        'BLOCK',
        `Route type ${routePlan.routeType} is not allowed by execution policy.`,
      ),
    )
  }

  if (routePlan.routeType === 'NO_ROUTE') {
    findings.push(
      makeFinding('ROUTE_TYPE_BLOCKED', 'BLOCK', 'NO_ROUTE cannot pass route execution preflight.'),
    )
  }

  if (
    policy.blockOnRouteWarnings &&
    routePlan.findings.some((finding) => finding.severity === 'WARN')
  ) {
    findings.push(
      makeFinding(
        'ROUTE_FINDINGS_BLOCKING',
        'BLOCK',
        'Route plan contains warnings blocked by execution policy.',
      ),
    )
  }

  if (isExternalRoute(routePlan.routeType)) {
    if (!policy.allowExternalProviderRoutes) {
      findings.push(
        makeFinding(
          'ROUTE_TYPE_BLOCKED',
          'BLOCK',
          `External provider route ${routePlan.routeType} is blocked by execution policy.`,
        ),
      )
    } else if (!policy.operatorApprovedExternalRoute) {
      findings.push(
        makeFinding(
          'EXTERNAL_ROUTE_REQUIRES_APPROVAL',
          'ASK',
          `External provider route ${routePlan.routeType} requires operator approval.`,
        ),
      )
    }
  }

  const accepted = findings.every((finding) => finding.severity === 'INFO')

  if (accepted) {
    findings.push(
      makeFinding(
        'PREFLIGHT_ACCEPTED',
        'INFO',
        `Route type ${routePlan.routeType} passed execution preflight.`,
      ),
    )
    rationale.push('Route plan passed deterministic execution preflight checks.')
  } else {
    rationale.push('Route plan did not pass deterministic execution preflight checks.')
  }

  rationale.push('AGENT-KERNEL-06 authorizes readiness state only.')
  rationale.push(
    'Provider invocation, repository mutation, and command execution remain outside this block.',
  )

  return {
    blockId: AGENT_KERNEL_ROUTE_PREFLIGHT_BLOCK_ID,
    prId: AGENT_KERNEL_ROUTE_PREFLIGHT_PR_ID,
    phaseId: AGENT_KERNEL_ROUTE_PREFLIGHT_PHASE_ID,
    packetId: routePlan.packetId,
    routeType: routePlan.routeType,
    accepted,
    executionReady: accepted,
    providerInvoked: false,
    repoMutationAllowed: false,
    commandExecutionAllowed: false,
    findings,
    rationale,
  }
}
