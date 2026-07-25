import {
  evaluateSymbolWrightPermissionRequest,
  resolveHighestDisposition,
} from '../permissions/symbolwright-permission-policy.js'
import type {
  SymbolWrightPermissionDecision,
  SymbolWrightPermissionDisposition,
  SymbolWrightPermissionRequest,
} from '../permissions/symbolwright-permission.types.js'

export const SYMBOLWRIGHT_GOVERNANCE_PROOF_BLOCK_ID = 'SYMBOLWRIGHT-PROOF-HARNESS-05' as const
export const SYMBOLWRIGHT_GOVERNANCE_PROOF_PR_ID = 'PR-CM-TEST-05' as const
export const SYMBOLWRIGHT_GOVERNANCE_PROOF_PHASE_ID = 'SYMBOLWRIGHT-TEST-05' as const

export const SYMBOLWRIGHT_GOVERNANCE_PROOF_STATUSES = [
  'GOVERNANCE_PROOF_READY',
  'GOVERNANCE_PROOF_PARTIAL',
  'GOVERNANCE_PROOF_BLOCKED',
  'GOVERNANCE_PROOF_INVALID',
] as const
export type SymbolWrightGovernanceProofStatus =
  (typeof SYMBOLWRIGHT_GOVERNANCE_PROOF_STATUSES)[number]

export interface SymbolWrightGovernanceProofCase {
  readonly request: SymbolWrightPermissionRequest
  readonly expectedDisposition: SymbolWrightPermissionDisposition
}

export interface SymbolWrightGovernanceProofInput {
  readonly testCases: readonly SymbolWrightGovernanceProofCase[]
  readonly blockingNotes?: readonly string[]
}

export interface SymbolWrightGovernanceProofCaseResult {
  readonly requestId: string
  readonly expectedDisposition: SymbolWrightPermissionDisposition
  readonly actualDisposition: SymbolWrightPermissionDisposition
  readonly passed: boolean
  readonly decision: SymbolWrightPermissionDecision
}

export interface SymbolWrightGovernanceProofReport {
  readonly blockId: typeof SYMBOLWRIGHT_GOVERNANCE_PROOF_BLOCK_ID
  readonly prId: typeof SYMBOLWRIGHT_GOVERNANCE_PROOF_PR_ID
  readonly phaseId: typeof SYMBOLWRIGHT_GOVERNANCE_PROOF_PHASE_ID
  readonly status: SymbolWrightGovernanceProofStatus
  readonly passedCount: number
  readonly failedCount: number
  readonly results: readonly SymbolWrightGovernanceProofCaseResult[]
  readonly blockingNotes: readonly string[]
  readonly highestDisposition: SymbolWrightPermissionDisposition
  readonly mutationAllowed: false
  readonly githubWriteAllowed: false
  readonly providerInvocationAllowed: false
  readonly summary: string
}

function resolveStatus(
  blockingNotes: readonly string[],
  failedCount: number,
  passedCount: number,
  totalCount: number,
): SymbolWrightGovernanceProofStatus {
  if (blockingNotes.length > 0) {
    return 'GOVERNANCE_PROOF_BLOCKED'
  }
  if (failedCount > 0) {
    return 'GOVERNANCE_PROOF_INVALID'
  }
  if (totalCount === 0 || passedCount === 0) {
    return 'GOVERNANCE_PROOF_PARTIAL'
  }
  return 'GOVERNANCE_PROOF_READY'
}

export function buildSymbolWrightGovernanceProofReport(
  input: SymbolWrightGovernanceProofInput,
): SymbolWrightGovernanceProofReport {
  const blockingNotes = [...(input.blockingNotes ?? [])].sort((a, b) => a.localeCompare(b))

  const results: SymbolWrightGovernanceProofCaseResult[] = input.testCases.map((testCase) => {
    const decision = evaluateSymbolWrightPermissionRequest(testCase.request)
    return {
      requestId: testCase.request.requestId,
      expectedDisposition: testCase.expectedDisposition,
      actualDisposition: decision.disposition,
      passed: decision.disposition === testCase.expectedDisposition,
      decision,
    }
  })

  const passedCount = results.filter((r) => r.passed).length
  const failedCount = results.filter((r) => !r.passed).length

  const allDispositions = results.map((r) => r.actualDisposition)
  const highestDisposition = resolveHighestDisposition(allDispositions)

  const status = resolveStatus(blockingNotes, failedCount, passedCount, input.testCases.length)

  const summary =
    status === 'GOVERNANCE_PROOF_BLOCKED'
      ? `Governance proof blocked: ${blockingNotes.length} blocking note(s).`
      : status === 'GOVERNANCE_PROOF_INVALID'
        ? `Governance proof invalid: ${failedCount} test case(s) failed.`
        : status === 'GOVERNANCE_PROOF_READY'
          ? `Governance proof ready: ${passedCount}/${input.testCases.length} test case(s) passed.`
          : `Governance proof partial: ${passedCount}/${input.testCases.length} test case(s) passed.`

  return {
    blockId: SYMBOLWRIGHT_GOVERNANCE_PROOF_BLOCK_ID,
    prId: SYMBOLWRIGHT_GOVERNANCE_PROOF_PR_ID,
    phaseId: SYMBOLWRIGHT_GOVERNANCE_PROOF_PHASE_ID,
    status,
    passedCount,
    failedCount,
    results,
    blockingNotes,
    highestDisposition,
    mutationAllowed: false,
    githubWriteAllowed: false,
    providerInvocationAllowed: false,
    summary,
  }
}
