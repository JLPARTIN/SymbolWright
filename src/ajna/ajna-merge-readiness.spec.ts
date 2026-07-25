import { describe, expect, it } from 'vitest'

import {
  canAjnaDeclareMergeReady,
  deriveAjnaMergeReadiness,
  isAjnaBlockedStatus,
} from './ajna-merge-readiness.js'
import type { AjnaReviewFinding, AjnaReviewRequest } from './ajna-review.types.js'

function makeRequest(overrides: Partial<AjnaReviewRequest> = {}): AjnaReviewRequest {
  return {
    requestId: 'ajna-req-1',
    subject: {
      repository: 'JLPARTIN/JLPARTIN-SymbolWright',
      pullRequestNumber: 4,
      baseRef: 'main',
      headRef: 'pr4-ajna-review-contracts',
    },
    changedFiles: [],
    requireCiEvidence: false,
    requireTestEvidence: false,
    ...overrides,
  }
}

function makeFinding(overrides: Partial<AjnaReviewFinding> = {}): AjnaReviewFinding {
  return {
    id: 'finding-1',
    category: 'DIFF_RISK',
    risk: 'LOW',
    title: 'Example finding',
    summary: 'Example summary',
    evidence: [
      {
        evidenceClass: 'DIRECT_DIFF_EVIDENCE',
        summary: 'Example evidence',
      },
    ],
    affectedFiles: ['src/example.ts'],
    recommendation: 'Review the finding.',
    blocksMerge: false,
    ...overrides,
  }
}

describe('Ajna merge-readiness contracts', () => {
  it('knows which statuses are blocked statuses', () => {
    expect(isAjnaBlockedStatus('BLOCKED_BY_RISK')).toBe(true)
    expect(isAjnaBlockedStatus('BLOCKED_BY_SECURITY')).toBe(true)
    expect(isAjnaBlockedStatus('READY_TO_REVIEW')).toBe(false)
  })

  it('does not declare merge-ready unless evidence gates are satisfied', () => {
    expect(
      canAjnaDeclareMergeReady({
        status: 'MERGE_READY_WITH_EVIDENCE',
        summary: 'Looks ready.',
        requiredEvidencePresent: false,
        blockingFindings: [],
        operatorDecisionRequired: false,
      }),
    ).toBe(false)

    expect(
      canAjnaDeclareMergeReady({
        status: 'MERGE_READY_WITH_EVIDENCE',
        summary: 'Ready with evidence.',
        requiredEvidencePresent: true,
        blockingFindings: [],
        operatorDecisionRequired: false,
      }),
    ).toBe(true)
  })

  it('blocks security-sensitive findings before merge', () => {
    const readiness = deriveAjnaMergeReadiness(makeRequest(), [
      makeFinding({
        id: 'security-1',
        category: 'SECURITY_SENSITIVE_CHANGE',
        risk: 'CRITICAL',
        blocksMerge: true,
      }),
    ])

    expect(readiness.status).toBe('BLOCKED_BY_SECURITY')
    expect(readiness.blockingFindings).toEqual(['security-1'])
    expect(canAjnaDeclareMergeReady(readiness)).toBe(false)
  })

  it('blocks architecture drift findings before merge', () => {
    const readiness = deriveAjnaMergeReadiness(makeRequest(), [
      makeFinding({
        id: 'arch-1',
        category: 'ARCHITECTURE_DRIFT',
        risk: 'HIGH',
        blocksMerge: true,
      }),
    ])

    expect(readiness.status).toBe('BLOCKED_BY_ARCHITECTURE_DRIFT')
    expect(readiness.blockingFindings).toEqual(['arch-1'])
  })

  it('requires test evidence when configured and test gaps exist', () => {
    const readiness = deriveAjnaMergeReadiness(makeRequest({ requireTestEvidence: true }), [
      makeFinding({ id: 'test-1', category: 'TEST_GAP', risk: 'MEDIUM' }),
    ])

    expect(readiness.status).toBe('NEEDS_TEST_EVIDENCE')
    expect(readiness.requiredEvidencePresent).toBe(false)
  })

  it('returns ready to review when no blockers exist and no evidence gates are required', () => {
    const readiness = deriveAjnaMergeReadiness(makeRequest(), [])

    expect(readiness.status).toBe('READY_TO_REVIEW')
    expect(canAjnaDeclareMergeReady(readiness)).toBe(false)
  })
})
