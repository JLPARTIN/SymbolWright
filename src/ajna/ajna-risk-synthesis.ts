import type { AjnaProofBundle } from './ajna-proof-bundle.js'

export const AJNA_RISK_SYNTHESIS_BLOCK_ID = 'CODEMIND-AJNA-REVIEW-09' as const
export const AJNA_RISK_SYNTHESIS_PR_ID = 'PR-CM-AJNA-09' as const
export const AJNA_RISK_SYNTHESIS_PHASE_ID = 'CODEMIND-AJNA-09' as const

export const AJNA_RISK_LEVELS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL', 'BLOCKED'] as const
export type AjnaRiskLevel = (typeof AJNA_RISK_LEVELS)[number]

export interface AjnaRiskSynthesisInput {
  readonly proofBundle: AjnaProofBundle
  readonly repoImpactLevel?: string
  readonly protectedFileCount?: number
  readonly blockingFindings?: readonly string[]
}

export interface AjnaRiskSynthesis {
  readonly blockId: typeof AJNA_RISK_SYNTHESIS_BLOCK_ID
  readonly prId: typeof AJNA_RISK_SYNTHESIS_PR_ID
  readonly phaseId: typeof AJNA_RISK_SYNTHESIS_PHASE_ID
  readonly riskLevel: AjnaRiskLevel
  readonly explanation: readonly string[]
  readonly mutationAllowed: false
  readonly githubWriteAllowed: false
  readonly providerInvocationAllowed: false
}

export function synthesizeAjnaRisk(input: AjnaRiskSynthesisInput): AjnaRiskSynthesis {
  const { proofBundle } = input
  const protectedFileCount = input.protectedFileCount ?? 0
  const blockingFindings = input.blockingFindings ?? []

  const explanation: string[] = []
  let riskLevel: AjnaRiskLevel

  if (
    proofBundle.invalidProofDomains.includes('governance') ||
    proofBundle.invalidProofDomains.includes('runtimeBoundary')
  ) {
    riskLevel = 'CRITICAL'
    explanation.push('CRITICAL: governance or runtime boundary proof is invalid.')
    proofBundle.invalidProofDomains.forEach((domain) => explanation.push(`invalid: ${domain}`))
  } else if (proofBundle.blockingProofDomains.length > 0 || blockingFindings.length > 0) {
    riskLevel = 'BLOCKED'
    explanation.push('BLOCKED: one or more proof domains are blocked.')
    proofBundle.blockingProofDomains.forEach((domain) => explanation.push(`blocked: ${domain}`))
    blockingFindings.forEach((finding) => explanation.push(`finding: ${finding}`))
  } else if (!proofBundle.allProofReady) {
    riskLevel = 'BLOCKED'
    explanation.push('BLOCKED: proof gate is closed — not all domains are ready.')
    if (proofBundle.missingProofDomains.length > 0) {
      explanation.push(`missing: ${proofBundle.missingProofDomains.join(', ')}`)
    }
    if (proofBundle.invalidProofDomains.length > 0) {
      explanation.push(`invalid: ${proofBundle.invalidProofDomains.join(', ')}`)
    }
  } else if (protectedFileCount > 0) {
    riskLevel = 'HIGH'
    explanation.push(`HIGH: ${protectedFileCount} protected file(s) changed.`)
  } else if (
    input.repoImpactLevel &&
    input.repoImpactLevel !== 'LOW' &&
    input.repoImpactLevel !== 'NONE'
  ) {
    riskLevel = 'MODERATE'
    explanation.push(`MODERATE: repo impact level is ${input.repoImpactLevel}.`)
  } else {
    riskLevel = 'LOW'
    explanation.push('LOW: all proof domains ready and no protected paths changed.')
  }

  return {
    blockId: AJNA_RISK_SYNTHESIS_BLOCK_ID,
    prId: AJNA_RISK_SYNTHESIS_PR_ID,
    phaseId: AJNA_RISK_SYNTHESIS_PHASE_ID,
    riskLevel,
    explanation,
    mutationAllowed: false,
    githubWriteAllowed: false,
    providerInvocationAllowed: false,
  }
}
