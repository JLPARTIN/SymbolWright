import type { AjnaReviewFinding, AjnaReviewRequest } from './ajna-review.types.js'
import type { CodemindAjnaReviewPrInput } from '../cli-ajna-review-pr.js'

export interface AjnaGithubPullRequestPayload {
  readonly repository: string
  readonly pullRequestNumber: number
  readonly baseRef: string
  readonly headRef: string
  readonly headSha?: string
  readonly changedFiles: readonly string[]
  readonly diffEvidence?: readonly string[]
  readonly ciEvidence?: readonly string[]
}

export interface AjnaGithubReviewNormalizerOptions {
  readonly requestId?: string
  readonly requireCiEvidence?: boolean
  readonly requireTestEvidence?: boolean
  readonly recommendedNextAction?: string
}

function assertNonEmptyString(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Ajna GitHub review payload ${field} must be a non-empty string.`)
  }
}

function assertPositiveInteger(value: unknown, field: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Ajna GitHub review payload ${field} must be a positive integer.`)
  }
}

function assertStringArray(values: unknown, field: string, options: { readonly allowEmpty?: boolean } = {}): void {
  if (
    !Array.isArray(values) ||
    (!options.allowEmpty && values.length === 0) ||
    !values.every((value) => typeof value === 'string' && value.length > 0)
  ) {
    throw new Error(`Ajna GitHub review payload ${field} must be an array of non-empty strings.`)
  }
}

function createRequest(
  payload: AjnaGithubPullRequestPayload,
  options: AjnaGithubReviewNormalizerOptions,
): AjnaReviewRequest {
  const subject = payload.headSha
    ? {
        repository: payload.repository,
        pullRequestNumber: payload.pullRequestNumber,
        baseRef: payload.baseRef,
        headRef: payload.headRef,
        commitSha: payload.headSha,
      }
    : {
        repository: payload.repository,
        pullRequestNumber: payload.pullRequestNumber,
        baseRef: payload.baseRef,
        headRef: payload.headRef,
      }

  return {
    requestId: options.requestId ?? `github-pr-${payload.pullRequestNumber}`,
    subject,
    changedFiles: payload.changedFiles,
    requireCiEvidence: options.requireCiEvidence ?? false,
    requireTestEvidence: options.requireTestEvidence ?? false,
  }
}

function createEvidenceFindings(payload: AjnaGithubPullRequestPayload): AjnaReviewFinding[] {
  const findings: AjnaReviewFinding[] = []

  if (payload.diffEvidence && payload.diffEvidence.length > 0) {
    findings.push({
      id: 'github-diff-evidence',
      category: 'DIFF_RISK',
      risk: 'LOW',
      title: 'GitHub diff evidence captured',
      summary: 'Mocked GitHub pull request diff evidence was normalized for Ajna review input.',
      evidence: payload.diffEvidence.map((summary) => ({
        evidenceClass: 'DIRECT_DIFF_EVIDENCE',
        summary,
      })),
      affectedFiles: payload.changedFiles,
      recommendation: 'Review the normalized diff evidence before relying on merge-readiness output.',
      blocksMerge: false,
    })
  }

  if (payload.ciEvidence && payload.ciEvidence.length > 0) {
    findings.push({
      id: 'github-ci-evidence',
      category: 'CI_SIGNAL',
      risk: 'LOW',
      title: 'GitHub CI evidence captured',
      summary: 'Mocked GitHub CI evidence was normalized for Ajna review input.',
      evidence: payload.ciEvidence.map((summary) => ({
        evidenceClass: 'DIRECT_CI_EVIDENCE',
        summary,
      })),
      affectedFiles: [],
      recommendation: 'Confirm CI summaries match the current pull request head before merge decisions.',
      blocksMerge: false,
    })
  }

  return findings
}

export function normalizeGithubPullRequestForAjnaReview(
  payload: AjnaGithubPullRequestPayload,
  options: AjnaGithubReviewNormalizerOptions = {},
): CodemindAjnaReviewPrInput {
  assertNonEmptyString(payload.repository, 'repository')
  assertPositiveInteger(payload.pullRequestNumber, 'pullRequestNumber')
  assertNonEmptyString(payload.baseRef, 'baseRef')
  assertNonEmptyString(payload.headRef, 'headRef')
  if (payload.headSha !== undefined) {
    assertNonEmptyString(payload.headSha, 'headSha')
  }
  assertStringArray(payload.changedFiles, 'changedFiles')
  if (payload.diffEvidence !== undefined) {
    assertStringArray(payload.diffEvidence, 'diffEvidence')
  }
  if (payload.ciEvidence !== undefined) {
    assertStringArray(payload.ciEvidence, 'ciEvidence', { allowEmpty: true })
  }

  const baseInput: CodemindAjnaReviewPrInput = {
    request: createRequest(payload, options),
    findings: createEvidenceFindings(payload),
  }

  if (options.recommendedNextAction !== undefined) {
    return {
      ...baseInput,
      recommendedNextAction: options.recommendedNextAction,
    }
  }

  return baseInput
}
