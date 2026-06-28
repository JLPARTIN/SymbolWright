import { readFileSync } from 'fs'

import { canAjnaDeclareMergeReady, deriveAjnaMergeReadiness } from './ajna/ajna-merge-readiness.js'
import { renderAjnaReviewReport } from './ajna/ajna-review-renderer.js'
import type {
  AjnaMergeReadiness,
  AjnaReviewFinding,
  AjnaReviewRequest,
  AjnaReviewResponse,
} from './ajna/ajna-review.types.js'
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertString(value: Record<string, unknown>, field: string, path: string): void {
  if (typeof value[field] !== 'string' || value[field].length === 0) {
    throw new Error(`Ajna review-pr input ${path}.${field} must be a non-empty string.`)
  }
}

function assertBoolean(value: Record<string, unknown>, field: string, path: string): void {
  if (typeof value[field] !== 'boolean') {
    throw new Error(`Ajna review-pr input ${path}.${field} must be a boolean.`)
  }
}

function assertStringArray(value: Record<string, unknown>, field: string, path: string): void {
  if (!Array.isArray(value[field]) || !value[field].every((item) => typeof item === 'string')) {
    throw new Error(`Ajna review-pr input ${path}.${field} must be an array of strings.`)
  }
}

function assertEvidenceRef(value: unknown, path: string): void {
  if (!isRecord(value)) {
    throw new Error(`Ajna review-pr input ${path} must be an object.`)
  }

  assertString(value, 'evidenceClass', path)
  assertString(value, 'summary', path)
}

function assertFinding(value: unknown, index: number): void {
  const path = `findings[${index}]`
  if (!isRecord(value)) {
    throw new Error(`Ajna review-pr input ${path} must be an object.`)
  }

  assertString(value, 'id', path)
  assertString(value, 'category', path)
  assertString(value, 'risk', path)
  assertString(value, 'title', path)
  assertString(value, 'summary', path)
  assertStringArray(value, 'affectedFiles', path)
  assertString(value, 'recommendation', path)
  assertBoolean(value, 'blocksMerge', path)

  if (!Array.isArray(value['evidence'])) {
    throw new Error(`Ajna review-pr input ${path}.evidence must be an array.`)
  }
  value['evidence'].forEach((evidence, evidenceIndex) => {
    assertEvidenceRef(evidence, `${path}.evidence[${evidenceIndex}]`)
  })
}

function defaultRecommendedNextAction(mergeReadiness: AjnaMergeReadiness): string {
  if (canAjnaDeclareMergeReady(mergeReadiness)) {
    return 'Ajna can declare this review merge-ready from the provided evidence.'
  }

  if (mergeReadiness.blockingFindings.length > 0) {
    return 'Resolve the blocking Ajna findings before requesting merge readiness.'
  }

  if (mergeReadiness.operatorDecisionRequired) {
    return 'Operator decision is required before merge readiness can be declared.'
  }

  return 'Review the Ajna report and provide any required CI or test evidence before merge.'
}

export function parseAjnaReviewPrInput(jsonText: string): CodemindAjnaReviewPrInput {
  const parsed = JSON.parse(jsonText) as { findings?: unknown; recommendedNextAction?: unknown }
  const base = parseAjnaMergeReadinessInput(jsonText)

  if (
    parsed.recommendedNextAction !== undefined &&
    typeof parsed.recommendedNextAction !== 'string'
  ) {
    throw new Error('Ajna review-pr input recommendedNextAction must be a string when provided.')
  }

  if (!Array.isArray(parsed.findings)) {
    throw new Error('Ajna review-pr input findings must be an array.')
  }
  parsed.findings.forEach((finding, index) => {
    assertFinding(finding, index)
  })

  if (typeof parsed.recommendedNextAction === 'string') {
    return {
      ...base,
      recommendedNextAction: parsed.recommendedNextAction,
    }
  }

  return base
}

export function readAjnaReviewPrInput(inputPath: string): CodemindAjnaReviewPrInput {
  return parseAjnaReviewPrInput(readFileSync(inputPath, 'utf-8'))
}

export function buildAjnaReviewPrForInput(
  input: CodemindAjnaReviewPrInput,
  inputPath: string | null = null,
): CodemindAjnaReviewPrCommandResult {
  const mergeReadiness = deriveAjnaMergeReadiness(input.request, input.findings)
  const response: AjnaReviewResponse = {
    requestId: input.request.requestId,
    subject: input.request.subject,
    changedFiles: input.request.changedFiles,
    tagline: 'See beyond the code.',
    subtitle: 'Expand your vision beyond the diff.',
    findings: input.findings,
    mergeReadiness,
    recommendedNextAction:
      input.recommendedNextAction ?? defaultRecommendedNextAction(mergeReadiness),
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
