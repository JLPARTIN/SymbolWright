import { describe, expect, it } from 'vitest'

import {
  buildCodemindRuntimeBoundaryProofReport,
  CODEMIND_RUNTIME_BOUNDARY_PROOF_BLOCK_ID,
  CODEMIND_RUNTIME_BOUNDARY_PROOF_PHASE_ID,
  CODEMIND_RUNTIME_BOUNDARY_PROOF_PR_ID,
  type CodemindRuntimeBoundaryFlags,
} from './codemind-runtime-boundary-proof.js'

const SAFE_FLAGS: CodemindRuntimeBoundaryFlags = {
  providerInvocationAllowed: false,
  repoMutationAllowed: false,
  commandExecutionAllowed: false,
  githubWriteAllowed: false,
  mergeAutomationAllowed: false,
  persistentMemoryWriteAllowed: false,
  automaticSkillPromotionAllowed: false,
}

describe('CodeMind Runtime Boundary Proof', () => {
  it('emits canonical metadata and keeps mutation flags false', () => {
    const report = buildCodemindRuntimeBoundaryProofReport({
      flags: SAFE_FLAGS,
      requiredGates: [],
      presentGates: [],
    })

    expect(report.blockId).toBe(CODEMIND_RUNTIME_BOUNDARY_PROOF_BLOCK_ID)
    expect(report.prId).toBe(CODEMIND_RUNTIME_BOUNDARY_PROOF_PR_ID)
    expect(report.phaseId).toBe(CODEMIND_RUNTIME_BOUNDARY_PROOF_PHASE_ID)
    expect(report.mutationAllowed).toBe(false)
    expect(report.githubWriteAllowed).toBe(false)
    expect(report.providerInvocationAllowed).toBe(false)
  })

  it('returns RUNTIME_BOUNDARY_PROOF_READY when all flags false and all gates present', () => {
    const report = buildCodemindRuntimeBoundaryProofReport({
      flags: SAFE_FLAGS,
      requiredGates: ['operator-approval-gate'],
      presentGates: ['operator-approval-gate'],
    })

    expect(report.status).toBe('RUNTIME_BOUNDARY_PROOF_READY')
    expect(report.flagViolations).toEqual([])
    expect(report.missingGates).toEqual([])
    expect(report.summary).toContain('ready')
  })

  it('returns RUNTIME_BOUNDARY_PROOF_INVALID when providerInvocationAllowed is true', () => {
    const report = buildCodemindRuntimeBoundaryProofReport({
      flags: { ...SAFE_FLAGS, providerInvocationAllowed: true as unknown as false },
      requiredGates: [],
      presentGates: [],
    })

    expect(report.status).toBe('RUNTIME_BOUNDARY_PROOF_INVALID')
    expect(report.flagViolations).toContain('providerInvocationAllowed must be false but is true.')
    expect(report.summary).toContain('invalid')
  })

  it('returns RUNTIME_BOUNDARY_PROOF_INVALID when commandExecutionAllowed is true', () => {
    const report = buildCodemindRuntimeBoundaryProofReport({
      flags: { ...SAFE_FLAGS, commandExecutionAllowed: true as unknown as false },
      requiredGates: [],
      presentGates: [],
    })

    expect(report.status).toBe('RUNTIME_BOUNDARY_PROOF_INVALID')
    expect(report.flagViolations).toContain('commandExecutionAllowed must be false but is true.')
  })

  it('returns RUNTIME_BOUNDARY_PROOF_INVALID when githubWriteAllowed is true', () => {
    const report = buildCodemindRuntimeBoundaryProofReport({
      flags: { ...SAFE_FLAGS, githubWriteAllowed: true as unknown as false },
      requiredGates: [],
      presentGates: [],
    })

    expect(report.status).toBe('RUNTIME_BOUNDARY_PROOF_INVALID')
    expect(report.flagViolations).toContain('githubWriteAllowed must be false but is true.')
  })

  it('returns RUNTIME_BOUNDARY_PROOF_PARTIAL when a required gate is missing', () => {
    const report = buildCodemindRuntimeBoundaryProofReport({
      flags: SAFE_FLAGS,
      requiredGates: ['operator-approval-gate', 'audit-gate'],
      presentGates: ['operator-approval-gate'],
    })

    expect(report.status).toBe('RUNTIME_BOUNDARY_PROOF_PARTIAL')
    expect(report.missingGates).toEqual(['audit-gate'])
    expect(report.summary).toContain('partial')
  })

  it('returns RUNTIME_BOUNDARY_PROOF_BLOCKED when blocking notes are present', () => {
    const report = buildCodemindRuntimeBoundaryProofReport({
      flags: SAFE_FLAGS,
      requiredGates: [],
      presentGates: [],
      blockingNotes: ['Runtime boundary audit pending.'],
    })

    expect(report.status).toBe('RUNTIME_BOUNDARY_PROOF_BLOCKED')
    expect(report.blockingNotes).toEqual(['Runtime boundary audit pending.'])
    expect(report.summary).toContain('blocked')
  })

  it('reports all flag violations at once', () => {
    const report = buildCodemindRuntimeBoundaryProofReport({
      flags: {
        providerInvocationAllowed: true as unknown as false,
        repoMutationAllowed: true as unknown as false,
        commandExecutionAllowed: false,
        githubWriteAllowed: false,
        mergeAutomationAllowed: false,
        persistentMemoryWriteAllowed: false,
        automaticSkillPromotionAllowed: false,
      },
      requiredGates: [],
      presentGates: [],
    })

    expect(report.flagViolations.length).toBe(2)
    expect(report.status).toBe('RUNTIME_BOUNDARY_PROOF_INVALID')
  })

  it('produces a deterministic summary across identical calls', () => {
    const input = { flags: SAFE_FLAGS, requiredGates: [], presentGates: [] }
    const r1 = buildCodemindRuntimeBoundaryProofReport(input)
    const r2 = buildCodemindRuntimeBoundaryProofReport(input)

    expect(r1.summary).toBe(r2.summary)
    expect(r1.status).toBe(r2.status)
  })
})
