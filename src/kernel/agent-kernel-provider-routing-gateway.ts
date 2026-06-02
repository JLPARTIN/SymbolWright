import type { AgentKernelContextPacket } from './agent-kernel-context-packet.js'

export const AGENT_KERNEL_PROVIDER_ROUTING_BLOCK_ID = 'AGENT-KERNEL-05' as const
export const AGENT_KERNEL_PROVIDER_ROUTING_PR_ID = 'PR-AK-05' as const
export const AGENT_KERNEL_PROVIDER_ROUTING_PHASE_ID = 'Phase-16G-AK-05' as const

export const AGENT_KERNEL_PROVIDER_ROUTE_TYPES = [
  'NO_ROUTE',
  'LOCAL_ONLY',
  'LIGHTWEIGHT_REASONING',
  'DEEP_REASONING',
  'AUDIT_REVIEW',
] as const
export type AgentKernelProviderRouteType = (typeof AGENT_KERNEL_PROVIDER_ROUTE_TYPES)[number]

export const AGENT_KERNEL_PROVIDER_ROUTE_FINDING_CODES = [
  'PACKET_NOT_READY',
  'PACKET_ALREADY_INVOKED',
  'PACKET_HAS_WARNINGS',
  'MISSING_REQUIRED_SECTION',
  'ROUTE_SELECTED',
] as const
export type AgentKernelProviderRouteFindingCode =
  (typeof AGENT_KERNEL_PROVIDER_ROUTE_FINDING_CODES)[number]

export const AGENT_KERNEL_PROVIDER_ROUTE_SEVERITIES = ['INFO', 'WARN', 'BLOCK'] as const
export type AgentKernelProviderRouteSeverity =
  (typeof AGENT_KERNEL_PROVIDER_ROUTE_SEVERITIES)[number]

export interface AgentKernelProviderRoutePolicy {
  readonly allowExternalProvider: boolean
  readonly preferLocalOnly: boolean
  readonly requireWorkflowSummary: boolean
  readonly requireSkillSummary: boolean
  readonly maxPacketWarnings: number
}

export interface AgentKernelProviderRouteFinding {
  readonly code: AgentKernelProviderRouteFindingCode
  readonly severity: AgentKernelProviderRouteSeverity
  readonly message: string
}

export interface AgentKernelProviderRoutePlan {
  readonly blockId: typeof AGENT_KERNEL_PROVIDER_ROUTING_BLOCK_ID
  readonly prId: typeof AGENT_KERNEL_PROVIDER_ROUTING_PR_ID
  readonly phaseId: typeof AGENT_KERNEL_PROVIDER_ROUTING_PHASE_ID
  readonly packetId: string
  readonly routeType: AgentKernelProviderRouteType
  readonly providerRouteReady: boolean
  readonly providerInvoked: false
  readonly selectedProvider?: string
  readonly findings: readonly AgentKernelProviderRouteFinding[]
  readonly rationale: readonly string[]
}

function makeFinding(
  code: AgentKernelProviderRouteFindingCode,
  severity: AgentKernelProviderRouteSeverity,
  message: string,
): AgentKernelProviderRouteFinding {
  return { code, severity, message }
}

function hasPacketSection(packet: AgentKernelContextPacket, section: string): boolean {
  return packet.items.some((item) => item.section === section)
}

function chooseRouteType(
  packet: AgentKernelContextPacket,
  policy: AgentKernelProviderRoutePolicy,
): AgentKernelProviderRouteType {
  if (!policy.allowExternalProvider || policy.preferLocalOnly) {
    return 'LOCAL_ONLY'
  }

  const hasCriticalItems = packet.items.some((item) => item.priority === 'CRITICAL')
  const hasAuditContent = packet.items.some(
    (item) =>
      item.section === 'workflow-validation' ||
      item.section === 'skill-validation' ||
      item.title.toLowerCase().includes('validation'),
  )

  if (hasAuditContent && packet.warnings.length > 0) {
    return 'AUDIT_REVIEW'
  }

  if (hasCriticalItems || packet.items.length >= 6) {
    return 'DEEP_REASONING'
  }

  return 'LIGHTWEIGHT_REASONING'
}

export function planAgentKernelProviderRoute(
  packet: AgentKernelContextPacket,
  policy: AgentKernelProviderRoutePolicy,
): AgentKernelProviderRoutePlan {
  const findings: AgentKernelProviderRouteFinding[] = []
  const rationale: string[] = []

  if (!packet.providerReady) {
    findings.push(
      makeFinding('PACKET_NOT_READY', 'BLOCK', 'Context packet is not ready for provider routing.'),
    )
  }

  if (packet.providerInvoked) {
    findings.push(
      makeFinding(
        'PACKET_ALREADY_INVOKED',
        'BLOCK',
        'Context packet must not be routed after provider invocation.',
      ),
    )
  }

  if (packet.warnings.length > policy.maxPacketWarnings) {
    findings.push(
      makeFinding(
        'PACKET_HAS_WARNINGS',
        'WARN',
        `Context packet warning count ${packet.warnings.length} exceeds policy maximum ${policy.maxPacketWarnings}.`,
      ),
    )
  }

  if (policy.requireWorkflowSummary && !hasPacketSection(packet, 'workflow-validation')) {
    findings.push(
      makeFinding(
        'MISSING_REQUIRED_SECTION',
        'BLOCK',
        'Provider routing requires a workflow validation packet section.',
      ),
    )
  }

  if (policy.requireSkillSummary && !hasPacketSection(packet, 'skill-validation')) {
    findings.push(
      makeFinding(
        'MISSING_REQUIRED_SECTION',
        'BLOCK',
        'Provider routing requires a skill validation packet section.',
      ),
    )
  }

  const blocked = findings.some((finding) => finding.severity === 'BLOCK')
  const routeType = blocked ? 'NO_ROUTE' : chooseRouteType(packet, policy)

  if (!blocked) {
    findings.push(
      makeFinding('ROUTE_SELECTED', 'INFO', `Selected provider route type: ${routeType}.`),
    )
    rationale.push('Context packet passed provider routing preflight.')
  } else {
    rationale.push('Context packet did not pass provider routing preflight.')
  }

  rationale.push('AGENT-KERNEL-05 produces routing recommendations only.')
  rationale.push('Provider invocation remains outside this block.')

  const basePlan: AgentKernelProviderRoutePlan = {
    blockId: AGENT_KERNEL_PROVIDER_ROUTING_BLOCK_ID,
    prId: AGENT_KERNEL_PROVIDER_ROUTING_PR_ID,
    phaseId: AGENT_KERNEL_PROVIDER_ROUTING_PHASE_ID,
    packetId: packet.packetId,
    routeType,
    providerRouteReady: !blocked,
    providerInvoked: false,
    findings,
    rationale,
  }

  if (routeType === 'NO_ROUTE' || routeType === 'LOCAL_ONLY') {
    return basePlan
  }

  return {
    ...basePlan,
    selectedProvider:
      routeType === 'DEEP_REASONING' || routeType === 'AUDIT_REVIEW'
        ? 'governed-deep-reasoning-provider'
        : 'governed-lightweight-reasoning-provider',
  }
}
