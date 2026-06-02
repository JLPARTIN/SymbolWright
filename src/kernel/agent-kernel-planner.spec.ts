import { describe, expect, it } from 'vitest'

import { planAgentKernel01 } from './agent-kernel-planner.js'
import type { AgentKernelPlanningRequest } from './agent-kernel.types.js'

function makeRequest(
  overrides: Partial<AgentKernelPlanningRequest> = {},
): AgentKernelPlanningRequest {
  return {
    requestId: 'ak-req-1',
    sessionId: 'session-1',
    operatorIntent: 'Migrate the A-O-S planning substrate into CodeMind.',
    targetRepository: 'JLPARTIN/JLPARTIN-CodeMind',
    targetRef: 'main',
    requestedMode: 'PLAN',
    requestedRoles: ['orchestrator', 'researcher', 'coder', 'validator'],
    requestedSkills: [],
    allowPatchProposal: false,
    ...overrides,
  }
}

describe('AGENT-KERNEL-01 planner', () => {
  it('preserves the canonical AGENT-KERNEL-01 lineage', () => {
    const decision = planAgentKernel01(makeRequest())

    expect(decision.blockId).toBe('AGENT-KERNEL-01')
    expect(decision.prId).toBe('PR-AK-01')
    expect(decision.phaseId).toBe('Phase-16G-AK-01')
  })

  it('defaults to a deterministic plan with operator checkpoints', () => {
    const decision = planAgentKernel01(makeRequest())

    expect(decision.accepted).toBe(true)
    expect(decision.workflowSteps[0]?.stepId).toBe('ak-01-governance-preflight')
    expect(decision.operatorCheckpoints).toContain('ak-01-governance-preflight')
    expect(decision.operatorCheckpoints).toContain('ak-01-operator-checkpoint')
    expect(decision.workflowSteps.every((step) => step.allowedToMutate === false)).toBe(true)
  })

  it('adds patch proposal planning only when explicitly allowed', () => {
    const planOnly = planAgentKernel01(makeRequest())
    const patchPlan = planAgentKernel01(
      makeRequest({ requestedMode: 'PATCH_PROPOSAL', allowPatchProposal: true }),
    )

    expect(planOnly.workflowSteps.some((step) => step.kind === 'patch-proposal')).toBe(false)
    expect(patchPlan.workflowSteps.some((step) => step.kind === 'patch-proposal')).toBe(true)
  })

  it('blocks patch proposal mode when the proposal flag is absent', () => {
    const decision = planAgentKernel01(
      makeRequest({ requestedMode: 'PATCH_PROPOSAL', allowPatchProposal: false }),
    )

    expect(decision.accepted).toBe(false)
    expect(decision.blockedReasons[0]).toContain('allowPatchProposal=true')
  })

  it('requires non-empty operator intent', () => {
    const decision = planAgentKernel01(makeRequest({ operatorIntent: '   ' }))

    expect(decision.accepted).toBe(false)
    expect(decision.blockedReasons).toContain(
      'Operator intent is required for deterministic kernel planning.',
    )
  })

  it('includes A-O-S source lineage in the planning decision', () => {
    const decision = planAgentKernel01(makeRequest({ requestedRoles: ['memory-auditor'] }))

    expect(decision.sourceLineage.some((line) => line.includes('X1YA0I-A-O-S'))).toBe(true)
    expect(
      decision.workflowSteps.some((step) => step.stepId === 'ak-01-memory-lineage-audit'),
    ).toBe(true)
  })
})
