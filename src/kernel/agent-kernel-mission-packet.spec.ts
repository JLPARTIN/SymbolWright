import { describe, expect, it } from 'vitest'

import { buildAgentKernelContextPacket } from './agent-kernel-context-packet.js'
import {
  buildAgentKernelMissionPacket,
  renderAgentKernelMissionPacket,
  type AgentKernelMissionPacketInput,
} from './agent-kernel-mission-packet.js'
import { planAgentKernel01 } from './agent-kernel-planner.js'
import { planAgentKernelProviderRoute } from './agent-kernel-provider-routing-gateway.js'
import { preflightAgentKernelRouteExecution } from './agent-kernel-route-execution-preflight.js'
import { validateAgentKernelSkillUse } from './agent-kernel-skill-validator.js'
import type { AgentKernelPlanningRequest } from './agent-kernel.types.js'
import { validateAgentKernelWorkflow } from './agent-kernel-workflow-validator.js'

function makeReadyInput(overrides: Partial<AgentKernelMissionPacketInput> = {}): AgentKernelMissionPacketInput {
  const planningRequest: AgentKernelPlanningRequest = {
    requestId: 'ak-08-req-1',
    sessionId: 'session-1',
    operatorIntent: 'Execute a governed mission through the agent kernel pipeline.',
    targetRepository: 'JLPARTIN/CodeMind',
    targetRef: 'main',
    requestedMode: 'PLAN',
    requestedRoles: ['orchestrator', 'researcher', 'coder', 'validator'],
    requestedSkills: ['repo-inspection'],
    allowPatchProposal: false,
  }

  const planning = planAgentKernel01(planningRequest)
  const workflowValidation = validateAgentKernelWorkflow(planning)
  const skillValidation = validateAgentKernelSkillUse({
    requestId: 'skill-use-1',
    skillId: 'repo-inspection',
    requestedToolCategory: 'FILE_READER',
    requestedOutputType: 'repo-context-summary',
    operatorApproved: true,
    maxAllowedRisk: 'LOW',
  })

  const contextPacket = buildAgentKernelContextPacket({
    packetId: 'packet-1',
    planningDecision: planning,
    workflowValidation,
    skillValidations: [skillValidation],
    repoContext: { repository: 'JLPARTIN/CodeMind', ref: 'main' },
    maxSections: 8,
    maxSourceLineageItems: 3,
  })

  const routePlan = planAgentKernelProviderRoute(contextPacket, {
    allowExternalProvider: false,
    preferLocalOnly: true,
    requireWorkflowSummary: true,
    requireSkillSummary: true,
    maxPacketWarnings: 0,
  })

  const preflightDecision = preflightAgentKernelRouteExecution(routePlan, {
    allowedRouteTypes: ['LOCAL_ONLY', 'LIGHTWEIGHT_REASONING', 'DEEP_REASONING', 'AUDIT_REVIEW'],
    allowExternalProviderRoutes: false,
    operatorApprovedExternalRoute: false,
    blockOnRouteWarnings: false,
  })

  return {
    missionId: 'mission-1',
    contextPacket,
    routePlan,
    preflightDecision,
    objectives: [
      { id: 'OBJ-1', summary: 'Analyze repository structure', priority: 'PRIMARY' },
      { id: 'OBJ-2', summary: 'Generate context report', priority: 'SECONDARY' },
    ],
    constraints: [
      { id: 'CON-1', rule: 'No mutation allowed', enforcedBy: 'kernel-policy' },
      { id: 'CON-2', rule: 'Read-only file access', enforcedBy: 'runtime-policy' },
    ],
    successCriteria: [
      { id: 'SC-1', description: 'Context packet assembled', measurable: true },
      { id: 'SC-2', description: 'No blocking findings', measurable: true },
    ],
    executionBoundary: {
      maxSteps: 10,
      allowMutation: false,
      allowExternalProvider: false,
      timeoutMs: 60_000,
    },
    ...overrides,
  }
}

describe('AGENT-KERNEL-08 mission packet generator', () => {
  it('builds a READY mission packet from valid pipeline outputs', () => {
    const packet = buildAgentKernelMissionPacket(makeReadyInput())

    expect(packet.blockId).toBe('AGENT-KERNEL-08')
    expect(packet.prId).toBe('PR-AK-08')
    expect(packet.phaseId).toBe('Phase-16G-AK-08')
    expect(packet.status).toBe('READY')
    expect(packet.providerInvoked).toBe(false)
    expect(packet.objectives).toHaveLength(2)
    expect(packet.constraints).toHaveLength(2)
    expect(packet.successCriteria).toHaveLength(2)
    expect(packet.findings.some((f) => f.code === 'MISSION_ASSEMBLED')).toBe(true)
  })

  it('preserves source packet and route type references', () => {
    const packet = buildAgentKernelMissionPacket(makeReadyInput())

    expect(packet.sourcePacketId).toBe('packet-1')
    expect(packet.sourceRouteType).toBe('LOCAL_ONLY')
    expect(packet.missionId).toBe('mission-1')
  })

  it('blocks when context packet is not provider-ready', () => {
    const input = makeReadyInput()
    const notReadyPacket = { ...input.contextPacket, providerReady: false }
    const packet = buildAgentKernelMissionPacket({ ...input, contextPacket: notReadyPacket })

    expect(packet.status).toBe('BLOCKED')
    expect(packet.findings.some((f) => f.code === 'CONTEXT_NOT_READY')).toBe(true)
  })

  it('blocks when route plan is not ready', () => {
    const input = makeReadyInput()
    const notReadyRoute = { ...input.routePlan, providerRouteReady: false }
    const packet = buildAgentKernelMissionPacket({ ...input, routePlan: notReadyRoute })

    expect(packet.status).toBe('BLOCKED')
    expect(packet.findings.some((f) => f.code === 'ROUTE_NOT_READY')).toBe(true)
  })

  it('blocks when preflight is not accepted', () => {
    const input = makeReadyInput()
    const notAccepted = { ...input.preflightDecision, accepted: false }
    const packet = buildAgentKernelMissionPacket({ ...input, preflightDecision: notAccepted })

    expect(packet.status).toBe('BLOCKED')
    expect(packet.findings.some((f) => f.code === 'PREFLIGHT_NOT_READY')).toBe(true)
  })

  it('blocks when no objectives provided', () => {
    const packet = buildAgentKernelMissionPacket(makeReadyInput({ objectives: [] }))

    expect(packet.status).toBe('BLOCKED')
    expect(packet.findings.some((f) => f.code === 'MISSING_OBJECTIVE' && f.severity === 'BLOCK')).toBe(true)
  })

  it('degrades when no PRIMARY objective', () => {
    const packet = buildAgentKernelMissionPacket(makeReadyInput({
      objectives: [{ id: 'OBJ-1', summary: 'Secondary task', priority: 'SECONDARY' }],
    }))

    expect(packet.status).toBe('DEGRADED')
    expect(packet.findings.some((f) => f.code === 'MISSING_OBJECTIVE' && f.severity === 'WARN')).toBe(true)
  })

  it('degrades when no constraints', () => {
    const packet = buildAgentKernelMissionPacket(makeReadyInput({ constraints: [] }))

    expect(packet.status).toBe('DEGRADED')
    expect(packet.findings.some((f) => f.code === 'MISSING_CONSTRAINT')).toBe(true)
  })

  it('degrades when no success criteria', () => {
    const packet = buildAgentKernelMissionPacket(makeReadyInput({ successCriteria: [] }))

    expect(packet.status).toBe('DEGRADED')
    expect(packet.findings.some((f) => f.code === 'SUCCESS_CRITERIA_EMPTY')).toBe(true)
  })

  it('blocks when maxSteps is zero or negative', () => {
    const packet = buildAgentKernelMissionPacket(makeReadyInput({
      executionBoundary: { maxSteps: 0, allowMutation: false, allowExternalProvider: false, timeoutMs: 60_000 },
    }))

    expect(packet.status).toBe('BLOCKED')
    expect(packet.findings.some((f) => f.code === 'EXECUTION_BOUNDARY_EXCEEDED')).toBe(true)
  })

  it('blocks when timeoutMs is zero or negative', () => {
    const packet = buildAgentKernelMissionPacket(makeReadyInput({
      executionBoundary: { maxSteps: 10, allowMutation: false, allowExternalProvider: false, timeoutMs: 0 },
    }))

    expect(packet.status).toBe('BLOCKED')
    expect(packet.findings.some((f) => f.code === 'EXECUTION_BOUNDARY_EXCEEDED')).toBe(true)
  })

  it('includes rationale explaining assembly outcome', () => {
    const ready = buildAgentKernelMissionPacket(makeReadyInput())
    expect(ready.rationale.some((r) => r.includes('ready for execution'))).toBe(true)
    expect(ready.rationale.some((r) => r.includes('AGENT-KERNEL-08'))).toBe(true)

    const blocked = buildAgentKernelMissionPacket(makeReadyInput({ objectives: [] }))
    expect(blocked.rationale.some((r) => r.includes('blocked'))).toBe(true)
  })
})

describe('renderAgentKernelMissionPacket', () => {
  it('renders READY mission packet', () => {
    const packet = buildAgentKernelMissionPacket(makeReadyInput())
    const output = renderAgentKernelMissionPacket(packet)

    expect(output).toContain('CodeMind Agent Kernel Mission Packet')
    expect(output).toContain('Status: READY')
    expect(output).toContain('AGENT-KERNEL-08')
    expect(output).toContain('OBJ-1')
    expect(output).toContain('CON-1')
    expect(output).toContain('SC-1')
    expect(output).toContain('Max steps: 10')
    expect(output).toContain('Provider invoked: no')
  })

  it('renders BLOCKED mission packet with findings', () => {
    const packet = buildAgentKernelMissionPacket(makeReadyInput({ objectives: [] }))
    const output = renderAgentKernelMissionPacket(packet)

    expect(output).toContain('Status: BLOCKED')
    expect(output).toContain('MISSING_OBJECTIVE')
  })

  it('renders DEGRADED mission packet', () => {
    const packet = buildAgentKernelMissionPacket(makeReadyInput({ constraints: [] }))
    const output = renderAgentKernelMissionPacket(packet)

    expect(output).toContain('Status: DEGRADED')
    expect(output).toContain('MISSION_DEGRADED')
  })
})
