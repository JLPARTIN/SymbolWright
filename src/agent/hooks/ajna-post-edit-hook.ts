import type { SymbolWrightChangedFileContext } from '../../repo-context/repo-context.types.js'
import { runAjnaLiveReview } from '../../ajna/ajna-live-review.js'
import type { AjnaLiveReviewResult } from '../../ajna/ajna-live-review.js'
import type { AjnaRiskLevel } from '../../ajna/ajna-risk-synthesis.js'

export interface AjnaPostEditContext {
  readonly repository: string
  readonly headRef: string
  readonly baseRef: string
  readonly headSha: string
  readonly baseSha: string
  readonly pullRequestNumber?: number
}

export interface AjnaPostEditResult {
  readonly triggered: boolean
  readonly riskLevel: AjnaRiskLevel
  readonly warning: string | undefined
  readonly review: AjnaLiveReviewResult | undefined
}

const WARN_THRESHOLD_LEVELS: ReadonlySet<AjnaRiskLevel> = new Set(['HIGH', 'CRITICAL', 'BLOCKED'])

function buildWarningMessage(review: AjnaLiveReviewResult): string {
  const lines: string[] = [`Ajna detected ${review.riskLevel} risk in your changes.`]

  if (review.findings.length > 0) {
    lines.push('')
    lines.push('Findings:')
    for (const finding of review.findings) {
      lines.push(`  - ${finding}`)
    }
  }

  if (review.highRiskFiles.length > 0) {
    lines.push('')
    lines.push('High-risk files:')
    for (const file of review.highRiskFiles) {
      lines.push(`  - ${file}`)
    }
  }

  if (review.mergeDecision === 'BLOCKED' || review.mergeDecision === 'NEEDS_OPERATOR_REVIEW') {
    lines.push('')
    lines.push(`Merge decision: ${review.mergeDecision}`)
    lines.push('Consider addressing these issues before proceeding.')
  }

  return lines.join('\n')
}

export function runAjnaPostEditHook(
  editedFiles: readonly SymbolWrightChangedFileContext[],
  context: AjnaPostEditContext,
): AjnaPostEditResult {
  if (editedFiles.length === 0) {
    return {
      triggered: false,
      riskLevel: 'LOW',
      warning: undefined,
      review: undefined,
    }
  }

  const review = runAjnaLiveReview({
    repository: context.repository,
    headRef: context.headRef,
    baseRef: context.baseRef,
    headSha: context.headSha,
    baseSha: context.baseSha,
    ...(context.pullRequestNumber !== undefined
      ? { pullRequestNumber: context.pullRequestNumber }
      : {}),
    changedFiles: editedFiles,
  })

  const shouldWarn = WARN_THRESHOLD_LEVELS.has(review.riskLevel)

  return {
    triggered: true,
    riskLevel: review.riskLevel,
    warning: shouldWarn ? buildWarningMessage(review) : undefined,
    review,
  }
}
