import { describe, expect, it } from 'vitest'

import {
  buildSymbolWrightGovernanceProofReport,
  SYMBOLWRIGHT_GOVERNANCE_PROOF_BLOCK_ID,
  SYMBOLWRIGHT_GOVERNANCE_PROOF_PHASE_ID,
  SYMBOLWRIGHT_GOVERNANCE_PROOF_PR_ID,
} from './symbolwright-governance-proof.js'
import type { SymbolWrightPermissionRequest } from '../permissions/symbolwright-permission.types.js'

function makeRequest(
  overrides: Partial<SymbolWrightPermissionRequest> = {},
): SymbolWrightPermissionRequest {
  return {
    requestId: 'req-001',
    sessionId: 'sess-001',
    mode: 'READ_ONLY',
    toolCategory: 'FILE_READER',
    action: 'read file',
    targets: [{ kind: 'file', value: 'src/index.ts' }],
    sourceTrustZone: 'OPERATOR_SESSION',
    operatorApproved: false,
    ...overrides,
  }
}

describe('SymbolWright Governance Proof', () => {
  it('emits canonical metadata and keeps mutation flags false', () => {
    const report = buildSymbolWrightGovernanceProofReport({
      testCases: [
        {
          request: makeRequest(),
          expectedDisposition: 'ASK',
        },
      ],
    })

    expect(report.blockId).toBe(SYMBOLWRIGHT_GOVERNANCE_PROOF_BLOCK_ID)
    expect(report.prId).toBe(SYMBOLWRIGHT_GOVERNANCE_PROOF_PR_ID)
    expect(report.phaseId).toBe(SYMBOLWRIGHT_GOVERNANCE_PROOF_PHASE_ID)
    expect(report.mutationAllowed).toBe(false)
    expect(report.githubWriteAllowed).toBe(false)
    expect(report.providerInvocationAllowed).toBe(false)
  })

  it('returns GOVERNANCE_PROOF_READY when all test cases pass', () => {
    const report = buildSymbolWrightGovernanceProofReport({
      testCases: [
        {
          request: makeRequest({ toolCategory: 'FILE_READER', operatorApproved: false }),
          expectedDisposition: 'ASK',
        },
        {
          request: makeRequest({
            toolCategory: 'FILE_READER',
            operatorApproved: true,
            targets: [{ kind: 'file', value: 'src/utils.ts' }],
          }),
          expectedDisposition: 'ALLOW',
        },
      ],
    })

    expect(report.status).toBe('GOVERNANCE_PROOF_READY')
    expect(report.passedCount).toBe(2)
    expect(report.failedCount).toBe(0)
    expect(report.summary).toContain('2/2')
  })

  it('returns GOVERNANCE_PROOF_INVALID when a test case fails', () => {
    const report = buildSymbolWrightGovernanceProofReport({
      testCases: [
        {
          request: makeRequest({ toolCategory: 'FILE_READER', operatorApproved: false }),
          expectedDisposition: 'ALLOW', // wrong expectation — policy will return ASK
        },
      ],
    })

    expect(report.status).toBe('GOVERNANCE_PROOF_INVALID')
    expect(report.failedCount).toBe(1)
    expect(report.summary).toContain('invalid')
  })

  it('returns GOVERNANCE_PROOF_BLOCKED when blocking notes are present', () => {
    const report = buildSymbolWrightGovernanceProofReport({
      testCases: [
        {
          request: makeRequest(),
          expectedDisposition: 'ASK',
        },
      ],
      blockingNotes: ['Governance policy update pending operator review.'],
    })

    expect(report.status).toBe('GOVERNANCE_PROOF_BLOCKED')
    expect(report.blockingNotes).toEqual(['Governance policy update pending operator review.'])
    expect(report.summary).toContain('blocked')
  })

  it('repo mutation is blocked without operator approval', () => {
    const report = buildSymbolWrightGovernanceProofReport({
      testCases: [
        {
          request: makeRequest({
            toolCategory: 'GIT_MUTATOR',
            operatorApproved: false,
          }),
          expectedDisposition: 'DENY',
        },
      ],
    })

    expect(report.status).toBe('GOVERNANCE_PROOF_READY')
    expect(report.results[0]?.passed).toBe(true)
  })

  it('protected path hit escalates disposition', () => {
    const report = buildSymbolWrightGovernanceProofReport({
      testCases: [
        {
          request: makeRequest({
            toolCategory: 'FILE_READER',
            operatorApproved: false,
            targets: [{ kind: 'file', value: '.env' }],
          }),
          expectedDisposition: 'DENY',
        },
      ],
    })

    expect(report.status).toBe('GOVERNANCE_PROOF_READY')
    expect(report.results[0]?.passed).toBe(true)
    expect(report.results[0]?.decision.protectedPathHits.length).toBeGreaterThan(0)
  })

  it('resolves the highest disposition across all case results', () => {
    const report = buildSymbolWrightGovernanceProofReport({
      testCases: [
        {
          request: makeRequest({
            toolCategory: 'FILE_READER',
            operatorApproved: true,
            targets: [{ kind: 'file', value: 'src/utils.ts' }],
          }),
          expectedDisposition: 'ALLOW',
        },
        {
          request: makeRequest({
            toolCategory: 'GIT_MUTATOR',
            operatorApproved: false,
          }),
          expectedDisposition: 'DENY',
        },
      ],
    })

    expect(report.highestDisposition).toBe('DENY')
  })

  it('produces a deterministic summary across identical calls', () => {
    const input = {
      testCases: [{ request: makeRequest(), expectedDisposition: 'ASK' as const }],
    }
    const r1 = buildSymbolWrightGovernanceProofReport(input)
    const r2 = buildSymbolWrightGovernanceProofReport(input)

    expect(r1.summary).toBe(r2.summary)
    expect(r1.status).toBe(r2.status)
  })
})
