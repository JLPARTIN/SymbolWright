import { describe, expect, it } from 'vitest'

import { executeRepairLoop, renderRepairLoopResult, type RepairLoopRequest } from './repair-loop.js'

const baseFinding = {
  id: 'F-001',
  category: 'type-error',
  message: 'Missing return type',
  severity: 'error',
  filePath: 'src/foo.ts',
}

const basePatch = {
  reason: 'Fix type error',
  rollbackNote: 'Revert src/foo.ts to previous version',
  files: [{ targetPath: 'src/foo.ts', content: 'fixed content' }],
}

const approvedReview = {
  decision: 'APPROVED' as const,
  reviewedBy: 'operator',
  notes: 'Looks good',
}

const passingValidation = {
  command: 'npm run typecheck',
  exitCode: 0,
  passed: true,
  summary: 'Typecheck passed',
}

const cleanReassessment = {
  verdict: 'READY',
  blockers: [],
  readiness: 'MERGE_READY',
}

function makeRequest(overrides: Partial<RepairLoopRequest> = {}): RepairLoopRequest {
  return {
    finding: baseFinding,
    patchProposal: basePatch,
    operatorReview: approvedReview,
    validationResults: [passingValidation],
    ajnaReassessment: cleanReassessment,
    stopAtCheckpoint: undefined,
    ...overrides,
  }
}

describe('executeRepairLoop', () => {
  it('completes full loop when all steps pass', () => {
    const result = executeRepairLoop(makeRequest())

    expect(result.outcome).toBe('COMPLETED')
    expect(result.lastCheckpoint).toBe('MERGE_READINESS_ASSESSED')
    expect(result.patchProposed).toBe(true)
    expect(result.operatorApproved).toBe(true)
    expect(result.patchApplied).toBe(true)
    expect(result.validationPassed).toBe(true)
    expect(result.ajnaReassessment?.verdict).toBe('READY')
    expect(result.blockReasons).toHaveLength(0)
  })

  it('blocks on empty finding ID', () => {
    const result = executeRepairLoop(
      makeRequest({
        finding: { ...baseFinding, id: '' },
      }),
    )

    expect(result.outcome).toBe('BLOCKED')
    expect(result.lastCheckpoint).toBe('AJNA_FINDING')
    expect(result.blockReasons.some((r) => r.includes('Finding ID'))).toBe(true)
  })

  it('blocks on empty finding message', () => {
    const result = executeRepairLoop(
      makeRequest({
        finding: { ...baseFinding, message: '' },
      }),
    )

    expect(result.outcome).toBe('BLOCKED')
    expect(result.blockReasons.some((r) => r.includes('Finding message'))).toBe(true)
  })

  it('stops at AJNA_FINDING checkpoint', () => {
    const result = executeRepairLoop(
      makeRequest({
        stopAtCheckpoint: 'AJNA_FINDING',
      }),
    )

    expect(result.outcome).toBe('STOPPED_AT_CHECKPOINT')
    expect(result.lastCheckpoint).toBe('AJNA_FINDING')
    expect(result.patchProposed).toBe(false)
  })

  it('stops at PATCH_PROPOSED checkpoint', () => {
    const result = executeRepairLoop(
      makeRequest({
        stopAtCheckpoint: 'PATCH_PROPOSED',
      }),
    )

    expect(result.outcome).toBe('STOPPED_AT_CHECKPOINT')
    expect(result.lastCheckpoint).toBe('PATCH_PROPOSED')
    expect(result.patchProposed).toBe(true)
  })

  it('blocks on empty patch files', () => {
    const result = executeRepairLoop(
      makeRequest({
        patchProposal: { ...basePatch, files: [] },
      }),
    )

    expect(result.outcome).toBe('BLOCKED')
    expect(result.blockReasons.some((r) => r.includes('at least one file'))).toBe(true)
  })

  it('blocks on missing patch reason', () => {
    const result = executeRepairLoop(
      makeRequest({
        patchProposal: { ...basePatch, reason: '' },
      }),
    )

    expect(result.outcome).toBe('BLOCKED')
    expect(result.blockReasons.some((r) => r.includes('reason'))).toBe(true)
  })

  it('blocks on missing rollback note', () => {
    const result = executeRepairLoop(
      makeRequest({
        patchProposal: { ...basePatch, rollbackNote: '' },
      }),
    )

    expect(result.outcome).toBe('BLOCKED')
    expect(result.blockReasons.some((r) => r.includes('rollback note'))).toBe(true)
  })

  it('blocks on missing operator review', () => {
    const result = executeRepairLoop(
      makeRequest({
        operatorReview: undefined,
      }),
    )

    expect(result.outcome).toBe('BLOCKED')
    expect(result.lastCheckpoint).toBe('OPERATOR_REVIEWED')
    expect(result.blockReasons.some((r) => r.includes('Operator review is required'))).toBe(true)
  })

  it('blocks on rejected operator review', () => {
    const result = executeRepairLoop(
      makeRequest({
        operatorReview: {
          decision: 'REJECTED',
          reviewedBy: 'operator',
          notes: 'Not the right fix',
        },
      }),
    )

    expect(result.outcome).toBe('BLOCKED')
    expect(result.blockReasons.some((r) => r.includes('rejected'))).toBe(true)
  })

  it('stops at OPERATOR_REVIEWED checkpoint', () => {
    const result = executeRepairLoop(
      makeRequest({
        stopAtCheckpoint: 'OPERATOR_REVIEWED',
      }),
    )

    expect(result.outcome).toBe('STOPPED_AT_CHECKPOINT')
    expect(result.lastCheckpoint).toBe('OPERATOR_REVIEWED')
  })

  it('stops at PATCH_APPLIED checkpoint', () => {
    const result = executeRepairLoop(
      makeRequest({
        stopAtCheckpoint: 'PATCH_APPLIED',
      }),
    )

    expect(result.outcome).toBe('STOPPED_AT_CHECKPOINT')
    expect(result.lastCheckpoint).toBe('PATCH_APPLIED')
    expect(result.patchApplied).toBe(false)
  })

  it('reports VALIDATION_FAILED when validation fails', () => {
    const result = executeRepairLoop(
      makeRequest({
        validationResults: [
          {
            command: 'npm run typecheck',
            exitCode: 1,
            passed: false,
            summary: 'Typecheck failed',
          },
        ],
      }),
    )

    expect(result.outcome).toBe('VALIDATION_FAILED')
    expect(result.lastCheckpoint).toBe('VALIDATION_RUN')
    expect(result.validationPassed).toBe(false)
    expect(result.blockReasons.some((r) => r.includes('Validation failed'))).toBe(true)
  })

  it('stops at VALIDATION_RUN checkpoint', () => {
    const result = executeRepairLoop(
      makeRequest({
        stopAtCheckpoint: 'VALIDATION_RUN',
      }),
    )

    expect(result.outcome).toBe('STOPPED_AT_CHECKPOINT')
    expect(result.lastCheckpoint).toBe('VALIDATION_RUN')
    expect(result.validationPassed).toBe(true)
  })

  it('blocks on missing Ajna reassessment', () => {
    const result = executeRepairLoop(
      makeRequest({
        ajnaReassessment: undefined,
      }),
    )

    expect(result.outcome).toBe('BLOCKED')
    expect(result.blockReasons.some((r) => r.includes('Ajna reassessment'))).toBe(true)
  })

  it('stops at AJNA_REASSESSED checkpoint', () => {
    const result = executeRepairLoop(
      makeRequest({
        stopAtCheckpoint: 'AJNA_REASSESSED',
      }),
    )

    expect(result.outcome).toBe('STOPPED_AT_CHECKPOINT')
    expect(result.lastCheckpoint).toBe('AJNA_REASSESSED')
    expect(result.ajnaReassessment).toBeDefined()
  })

  it('blocks on Ajna blockers', () => {
    const result = executeRepairLoop(
      makeRequest({
        ajnaReassessment: {
          verdict: 'BLOCKED',
          blockers: ['Test coverage below threshold'],
          readiness: 'NOT_READY',
        },
      }),
    )

    expect(result.outcome).toBe('BLOCKED')
    expect(result.lastCheckpoint).toBe('MERGE_READINESS_ASSESSED')
    expect(result.blockReasons.some((r) => r.includes('Ajna blocker'))).toBe(true)
  })
})

describe('renderRepairLoopResult', () => {
  it('renders completed result', () => {
    const result = executeRepairLoop(makeRequest())
    const output = renderRepairLoopResult(result)

    expect(output).toContain('CodeMind Repair Loop')
    expect(output).toContain('Outcome: COMPLETED')
    expect(output).toContain('Ajna verdict: READY')
    expect(output).toContain('Merge readiness: MERGE_READY')
  })

  it('renders blocked result with reasons', () => {
    const result = executeRepairLoop(makeRequest({ operatorReview: undefined }))
    const output = renderRepairLoopResult(result)

    expect(output).toContain('Outcome: BLOCKED')
    expect(output).toContain('Block reasons:')
    expect(output).toContain('Operator review is required')
  })

  it('renders validation failed result', () => {
    const result = executeRepairLoop(
      makeRequest({
        validationResults: [
          {
            command: 'npm test',
            exitCode: 1,
            passed: false,
            summary: 'Tests failed',
          },
        ],
      }),
    )
    const output = renderRepairLoopResult(result)

    expect(output).toContain('Outcome: VALIDATION_FAILED')
    expect(output).toContain('Validation passed: no')
  })
})
