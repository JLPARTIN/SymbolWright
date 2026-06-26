import type { AjnaLiveReviewResult } from './ajna-live-review.js'
import { runAjnaLiveReview } from './ajna-live-review.js'
import type { AjnaLiveReviewInput } from './ajna-live-review.js'
import type { AjnaMergeDecisionState } from './ajna-merge-decision.js'

export type AjnaMergeGateVerdict = 'APPROVED' | 'BLOCKED' | 'NEEDS_OPERATOR_REVIEW'

export interface AjnaMergeGateResult {
  readonly verdict: AjnaMergeGateVerdict
  readonly mergeDecision: AjnaMergeDecisionState
  readonly riskLevel: string
  readonly reasons: readonly string[]
  readonly evidenceSummary: string
  readonly review: AjnaLiveReviewResult
}

function mergeDecisionToVerdict(state: AjnaMergeDecisionState): AjnaMergeGateVerdict {
  switch (state) {
    case 'MERGE_READY':
      return 'APPROVED'
    case 'NEEDS_OPERATOR_REVIEW':
      return 'NEEDS_OPERATOR_REVIEW'
    case 'NOT_READY':
    case 'BLOCKED':
      return 'BLOCKED'
  }
}

function buildEvidenceSummary(review: AjnaLiveReviewResult): string {
  const lines: string[] = []

  lines.push(`Risk Level: ${review.riskLevel}`)
  lines.push(`Merge Decision: ${review.mergeDecision}`)

  if (review.protectedFileCount > 0) {
    lines.push(`Protected Files Modified: ${review.protectedFileCount}`)
  }

  if (review.highRiskFiles.length > 0) {
    lines.push(`High-Risk Files: ${review.highRiskFiles.join(', ')}`)
  }

  if (review.findings.length > 0) {
    lines.push('')
    lines.push('Findings:')
    for (const finding of review.findings) {
      lines.push(`- ${finding}`)
    }
  }

  return lines.join('\n')
}

export function evaluateAjnaMergeGate(input: AjnaLiveReviewInput): AjnaMergeGateResult {
  const review = runAjnaLiveReview(input)
  const verdict = mergeDecisionToVerdict(review.mergeDecision)

  const reasons: string[] = []
  const pipelineReasons = review.pipelineReport.mergeDecision.reasons
  for (const reason of pipelineReasons) {
    reasons.push(reason)
  }

  if (review.findings.length > 0) {
    for (const finding of review.findings) {
      reasons.push(finding)
    }
  }

  return {
    verdict,
    mergeDecision: review.mergeDecision,
    riskLevel: review.riskLevel,
    reasons,
    evidenceSummary: buildEvidenceSummary(review),
    review,
  }
}
