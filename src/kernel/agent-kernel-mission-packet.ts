import type { AgentKernelContextPacket } from './agent-kernel-context-packet.js'
import type { AgentKernelProviderRoutePlan } from './agent-kernel-provider-routing-gateway.js'
import type { AgentKernelRouteExecutionPreflightDecision } from './agent-kernel-route-execution-preflight.js'

export const AGENT_KERNEL_MISSION_PACKET_BLOCK_ID = 'AGENT-KERNEL-08' as const
export const AGENT_KERNEL_MISSION_PACKET_PR_ID = 'PR-AK-08' as const
export const AGENT_KERNEL_MISSION_PACKET_PHASE_ID = 'Phase-16G-AK-08' as const

export const AGENT_KERNEL_MISSION_STATUSES = ['READY', 'BLOCKED', 'DEGRADED'] as const
export type AgentKernelMissionStatus = (typeof AGENT_KERNEL_MISSION_STATUSES)[number]

export const AGENT_KERNEL_MISSION_FINDING_SEVERITIES = ['INFO', 'WARN', 'BLOCK'] as const
export type AgentKernelMissionFindingSeverity =
  (typeof AGENT_KERNEL_MISSION_FINDING_SEVERITIES)[number]

export const AGENT_KERNEL_MISSION_FINDING_CODES = [
  'CONTEXT_NOT_READY',
  'ROUTE_NOT_READY',
  'PREFLIGHT_NOT_READY',
  'MISSING_OBJECTIVE',
  'MISSING_CONSTRAINT',
  'SUCCESS_CRITERIA_EMPTY',
  'EXECUTION_BOUNDARY_EXCEEDED',
  'MISSION_ASSEMBLED',
  'MISSION_DEGRADED',
] as const
export type AgentKernelMissionFindingCode =
  (typeof AGENT_KERNEL_MISSION_FINDING_CODES)[number]

export interface AgentKernelMissionFinding {
  readonly code: AgentKernelMissionFindingCode
  readonly severity: AgentKernelMissionFindingSeverity
  readonly message: string
}

export interface AgentKernelMissionObjective {
  readonly id: string
  readonly summary: string
  readonly priority: 'PRIMARY' | 'SECONDARY'
}

export interface AgentKernelMissionConstraint {
  readonly id: string
  readonly rule: string
  readonly enforcedBy: string
}

export interface AgentKernelMissionSuccessCriterion {
  readonly id: string
  readonly description: string
  readonly measurable: boolean
}

export interface AgentKernelMissionExecutionBoundary {
  readonly maxSteps: number
  readonly allowMutation: boolean
  readonly allowExternalProvider: boolean
  readonly timeoutMs: number
}

export interface AgentKernelMissionPacketInput {
  readonly missionId: string
  readonly contextPacket: AgentKernelContextPacket
  readonly routePlan: AgentKernelProviderRoutePlan
  readonly preflightDecision: AgentKernelRouteExecutionPreflightDecision
  readonly objectives: readonly AgentKernelMissionObjective[]
  readonly constraints: readonly AgentKernelMissionConstraint[]
  readonly successCriteria: readonly AgentKernelMissionSuccessCriterion[]
  readonly executionBoundary: AgentKernelMissionExecutionBoundary
}

export interface AgentKernelMissionPacket {
  readonly missionId: string
  readonly blockId: typeof AGENT_KERNEL_MISSION_PACKET_BLOCK_ID
  readonly prId: typeof AGENT_KERNEL_MISSION_PACKET_PR_ID
  readonly phaseId: typeof AGENT_KERNEL_MISSION_PACKET_PHASE_ID
  readonly sourcePacketId: string
  readonly sourceRouteType: string
  readonly status: AgentKernelMissionStatus
  readonly providerInvoked: false
  readonly objectives: readonly AgentKernelMissionObjective[]
  readonly constraints: readonly AgentKernelMissionConstraint[]
  readonly successCriteria: readonly AgentKernelMissionSuccessCriterion[]
  readonly executionBoundary: AgentKernelMissionExecutionBoundary
  readonly findings: readonly AgentKernelMissionFinding[]
  readonly rationale: readonly string[]
}

function makeFinding(
  code: AgentKernelMissionFindingCode,
  severity: AgentKernelMissionFindingSeverity,
  message: string,
): AgentKernelMissionFinding {
  return { code, severity, message }
}

function validateInput(input: AgentKernelMissionPacketInput): readonly AgentKernelMissionFinding[] {
  const findings: AgentKernelMissionFinding[] = []

  if (!input.contextPacket.providerReady) {
    findings.push(
      makeFinding('CONTEXT_NOT_READY', 'BLOCK', 'Context packet is not provider-ready.'),
    )
  }

  if (!input.routePlan.providerRouteReady) {
    findings.push(
      makeFinding('ROUTE_NOT_READY', 'BLOCK', 'Provider route plan is not ready.'),
    )
  }

  if (!input.preflightDecision.accepted) {
    findings.push(
      makeFinding('PREFLIGHT_NOT_READY', 'BLOCK', 'Route execution preflight is not accepted.'),
    )
  }

  if (input.objectives.length === 0) {
    findings.push(
      makeFinding('MISSING_OBJECTIVE', 'BLOCK', 'At least one mission objective is required.'),
    )
  }

  const hasPrimary = input.objectives.some((obj) => obj.priority === 'PRIMARY')
  if (input.objectives.length > 0 && !hasPrimary) {
    findings.push(
      makeFinding('MISSING_OBJECTIVE', 'WARN', 'No PRIMARY objective specified; mission may lack focus.'),
    )
  }

  if (input.constraints.length === 0) {
    findings.push(
      makeFinding('MISSING_CONSTRAINT', 'WARN', 'No constraints specified; mission runs with default safety bounds.'),
    )
  }

  if (input.successCriteria.length === 0) {
    findings.push(
      makeFinding('SUCCESS_CRITERIA_EMPTY', 'WARN', 'No success criteria specified; mission completion is undefined.'),
    )
  }

  if (input.executionBoundary.maxSteps <= 0) {
    findings.push(
      makeFinding('EXECUTION_BOUNDARY_EXCEEDED', 'BLOCK', 'maxSteps must be greater than zero.'),
    )
  }

  if (input.executionBoundary.timeoutMs <= 0) {
    findings.push(
      makeFinding('EXECUTION_BOUNDARY_EXCEEDED', 'BLOCK', 'timeoutMs must be greater than zero.'),
    )
  }

  return findings
}

export function buildAgentKernelMissionPacket(
  input: AgentKernelMissionPacketInput,
): AgentKernelMissionPacket {
  const inputFindings = validateInput(input)
  const findings: AgentKernelMissionFinding[] = [...inputFindings]
  const rationale: string[] = []

  const blocked = findings.some((f) => f.severity === 'BLOCK')
  const hasWarnings = findings.some((f) => f.severity === 'WARN')

  let status: AgentKernelMissionStatus
  if (blocked) {
    status = 'BLOCKED'
    rationale.push('Mission packet assembly blocked by one or more validation findings.')
  } else if (hasWarnings) {
    status = 'DEGRADED'
    findings.push(
      makeFinding('MISSION_DEGRADED', 'INFO', 'Mission packet assembled with warnings.'),
    )
    rationale.push('Mission packet assembled in degraded state due to warnings.')
  } else {
    status = 'READY'
    findings.push(
      makeFinding('MISSION_ASSEMBLED', 'INFO', 'Mission packet assembled successfully.'),
    )
    rationale.push('All prerequisites met; mission packet is ready for execution planning.')
  }

  rationale.push('AGENT-KERNEL-08 produces mission packets only; execution remains outside this block.')

  return {
    missionId: input.missionId,
    blockId: AGENT_KERNEL_MISSION_PACKET_BLOCK_ID,
    prId: AGENT_KERNEL_MISSION_PACKET_PR_ID,
    phaseId: AGENT_KERNEL_MISSION_PACKET_PHASE_ID,
    sourcePacketId: input.contextPacket.packetId,
    sourceRouteType: input.routePlan.routeType,
    status,
    providerInvoked: false,
    objectives: input.objectives,
    constraints: input.constraints,
    successCriteria: input.successCriteria,
    executionBoundary: input.executionBoundary,
    findings,
    rationale,
  }
}

export function renderAgentKernelMissionPacket(packet: AgentKernelMissionPacket): string {
  const lines = [
    'CodeMind Agent Kernel Mission Packet',
    '',
    `Mission ID: ${packet.missionId}`,
    `Block: ${packet.blockId}`,
    `Status: ${packet.status}`,
    `Source packet: ${packet.sourcePacketId}`,
    `Route type: ${packet.sourceRouteType}`,
    `Provider invoked: no`,
  ]

  if (packet.objectives.length > 0) {
    lines.push('', 'Objectives:')
    for (const obj of packet.objectives) {
      lines.push(`- [${obj.priority}] ${obj.id}: ${obj.summary}`)
    }
  }

  if (packet.constraints.length > 0) {
    lines.push('', 'Constraints:')
    for (const constraint of packet.constraints) {
      lines.push(`- ${constraint.id}: ${constraint.rule} (enforced by ${constraint.enforcedBy})`)
    }
  }

  if (packet.successCriteria.length > 0) {
    lines.push('', 'Success criteria:')
    for (const criterion of packet.successCriteria) {
      lines.push(`- ${criterion.id}: ${criterion.description} (measurable: ${criterion.measurable ? 'yes' : 'no'})`)
    }
  }

  lines.push('', 'Execution boundary:')
  lines.push(`  Max steps: ${packet.executionBoundary.maxSteps}`)
  lines.push(`  Allow mutation: ${packet.executionBoundary.allowMutation ? 'yes' : 'no'}`)
  lines.push(`  Allow external provider: ${packet.executionBoundary.allowExternalProvider ? 'yes' : 'no'}`)
  lines.push(`  Timeout: ${packet.executionBoundary.timeoutMs}ms`)

  if (packet.findings.length > 0) {
    lines.push('', 'Findings:')
    for (const finding of packet.findings) {
      lines.push(`- [${finding.severity}] ${finding.code}: ${finding.message}`)
    }
  }

  if (packet.rationale.length > 0) {
    lines.push('', 'Rationale:')
    for (const note of packet.rationale) {
      lines.push(`- ${note}`)
    }
  }

  return lines.join('\n')
}
