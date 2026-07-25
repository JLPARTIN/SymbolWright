import type { AjnaProofBundle } from './ajna-proof-bundle.js'
import type { AjnaRiskLevel, AjnaRiskSynthesis } from './ajna-risk-synthesis.js'

export const AJNA_MERGE_DECISION_BLOCK_ID = 'SYMBOLWRIGHT-AJNA-REVIEW-09' as const
export const AJNA_MERGE_DECISION_PR_ID = 'PR-CM-AJNA-09' as const
export const AJNA_MERGE_DECISION_PHASE_ID = 'SYMBOLWRIGHT-AJNA-09' as const

export const AJNA_MERGE_DECISION_STATES = [
  'MERGE_READY',
  'NOT_READY',
  'BLOCKED',
  'NEEDS_OPERATOR_REVIEW',
] as const
export type AjnaMergeDecisionState = (typeof AJNA_MERGE_DECISION_STATES)[number]

const OPERATOR_REVIEW_RISK_LEVELS: ReadonlySet<AjnaRiskLevel> = new Set(['HIGH', 'CRITICAL'])
const BLOCKED_RISK_LEVELS: ReadonlySet<AjnaRiskLevel> = new Set(['BLOCKED'])
const READY_RISK_LEVELS: ReadonlySet<AjnaRiskLevel> = new Set(['LOW', 'MODERATE'])

export interface AjnaMergeDecisionInput {
  readonly proofBundle: AjnaProofBundle
  readonly riskSynthesis: AjnaRiskSynthesis
  readonly requiresOperatorApproval?: boolean
}

export interface AjnaMergeDecision {
  readonly blockId: typeof AJNA_MERGE_DECISION_BLOCK_ID
  readonly prId: typeof AJNA_MERGE_DECISION_PR_ID
  readonly phaseId: typeof AJNA_MERGE_DECISION_PHASE_ID
  readonly state: AjnaMergeDecisionState
  readonly reasons: readonly string[]
  readonly mutationAllowed: false
  readonly githubWriteAllowed: false
  readonly providerInvocationAllowed: false
}

export function buildAjnaMergeDecision(input: AjnaMergeDecisionInput): AjnaMergeDecision {
  const { proofBundle, riskSynthesis } = input
  const reasons: string[] = []
  let state: AjnaMergeDecisionState

  if (BLOCKED_RISK_LEVELS.has(riskSynthesis.riskLevel)) {
    state = 'BLOCKED'
    reasons.push(`Risk level is ${riskSynthesis.riskLevel}.`)
    if (proofBundle.blockingProofDomains.length > 0) {
      reasons.push(`Blocked domains: ${proofBundle.blockingProofDomains.join(', ')}.`)
    }
    if (proofBundle.invalidProofDomains.length > 0) {
      reasons.push(`Invalid domains: ${proofBundle.invalidProofDomains.join(', ')}.`)
    }
    if (proofBundle.missingProofDomains.length > 0) {
      reasons.push(`Missing domains: ${proofBundle.missingProofDomains.join(', ')}.`)
    }
  } else if (OPERATOR_REVIEW_RISK_LEVELS.has(riskSynthesis.riskLevel)) {
    state = 'NEEDS_OPERATOR_REVIEW'
    reasons.push(`Risk level is ${riskSynthesis.riskLevel} — operator review required.`)
  } else if (input.requiresOperatorApproval) {
    state = 'NEEDS_OPERATOR_REVIEW'
    reasons.push('operator approval gate is required.')
  } else if (!proofBundle.allProofReady) {
    state = 'NOT_READY'
    reasons.push('Not all proof domains are ready.')
    if (proofBundle.missingProofDomains.length > 0) {
      reasons.push(`Missing domains: ${proofBundle.missingProofDomains.join(', ')}.`)
    }
  } else if (READY_RISK_LEVELS.has(riskSynthesis.riskLevel)) {
    state = 'MERGE_READY'
    reasons.push(`All proof domains ready. Risk level: ${riskSynthesis.riskLevel}.`)
  } else {
    state = 'NOT_READY'
    reasons.push(`Risk level ${riskSynthesis.riskLevel} does not permit merge-ready.`)
  }

  return {
    blockId: AJNA_MERGE_DECISION_BLOCK_ID,
    prId: AJNA_MERGE_DECISION_PR_ID,
    phaseId: AJNA_MERGE_DECISION_PHASE_ID,
    state,
    reasons,
    mutationAllowed: false,
    githubWriteAllowed: false,
    providerInvocationAllowed: false,
  }
}
