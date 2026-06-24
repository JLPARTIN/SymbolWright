import { readFileSync } from 'fs'

import { canAjnaDeclareMergeReady, deriveAjnaMergeReadiness } from './ajna/ajna-merge-readiness.js'
import { renderAjnaReviewReport } from './ajna/ajna-review-renderer.js'
import type { AjnaReviewFinding, AjnaReviewRequest, AjnaReviewResponse } from './ajna/ajna-review.types.js'
import { parseAjnaMergeReadinessInput } from './cli-ajna-merge-readiness.js'

export interface CodemindAjnaReviewPrInput {
  readonly request: AjnaReviewRequest
  readonly findings: readonly AjnaReviewFinding[]
  readonly recommendedNextAction?: string
}

export interface CodemindAjnaReviewPrCommandResult {
  readonly inputPath: string | null
  readonly response: AjnaReviewResponse
  readonly output: string
}

function defaultRecommendedNextAction(response: AjnaReviewResponse): string {
  if (canAjnaDeclareMergeReady(response.mergeReadiness)) {
    return 'Ajna can declare this review merge-ready from the provided evidence.'
  }

  if (response.mergeReadiness.blockingFindings.length > 0) {
    return 'Resolve the blocking Ajna findings before requesting merge readiness.'
  }

  if (response.mergeReadiness.operatorDecisionRequired) {
    return 'Operator decision is required before merge readiness can be declared.'
  }

  return 'Review the Ajna report and provide any required CI or test evidence before merge.'
}

export function parseAjnaReviewPrInput(jsonText: string): CodemindAjnaReviewPrInput {
  const parsed = JSON.parse(jsonText) as { recommendedNextAction?: unknown }
  const base = parseAjnaMergeReadinessInput(jsonText)

  if (parsed.recommendedNextAction !== undefined && typeof parsed.recommendedNextAction !== 'string') {
    throw new Error('Ajna review-pr input recommendedNextAction must be a string when provided.')
  }

  return {
    ...base,
    recommendedNextAction: parsed.recommendedNextAction,
  }
}

export function readAjnaReviewPrInput(inputPath: string): CodemindAjnaReviewPrInput {
  return parseAjnaReviewPrInput(readFileSync(inputPath, 'utf-8'))
}

export function buildAjnaReviewPrForInput(
  input: CodemindAjnaReviewPrInput,
  inputPath: string | null = null,
): CodemindAjnaReviewPrCommandResult {
  const mergeReadiness = deriveAjnaMergeReadiness(input.request, input.findings)
  const responseWithoutAction: Omit<AjnaReviewResponse, 'recommendedNextAction'> = {
    requestId: input.request.requestId,
    subject: input.request.subject,
    tagline: 'See beyond the code.',
    subtitle: 'Expand your vision beyond the diff.',
    findings: input.findings,
    mergeReadiness,
  }
  const response: AjnaReviewResponse = {
    ...responseWithoutAction,
    recommendedNextAction:
      input.recommendedNextAction ??
      defaultRecommendedNextAction({
        ...responseWithoutAction,
        recommendedNextAction: '',
      }),
  }

  return {
    inputPath,
    response,
    output: renderAjnaReviewReport(response),
  }
}

export function renderAjnaReviewPrForFile(inputPath: string): string {
  return buildAjnaReviewPrForInput(readAjnaReviewPrInput(inputPath), inputPath).output
}
