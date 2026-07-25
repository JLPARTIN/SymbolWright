import type { AjnaReviewFinding, AjnaReviewRequest } from './ajna-review.types.js'
import type { SymbolWrightAjnaReviewPrInput } from '../cli-ajna-review-pr.js'
import {
  detectAjnaArchitectureDrift,
  type AjnaArchitecturePolicy,
  type AjnaImportEdge,
} from './ajna-architecture-drift.js'
import {
  detectAjnaSecuritySensitivePaths,
  type AjnaSecuritySensitivePolicy,
} from './ajna-security-sensitive-paths.js'

export interface AjnaGithubPullRequestPayload {
  readonly repository: string
  readonly pullRequestNumber: number
  readonly baseRef: string
  readonly headRef: string
  readonly headSha?: string
  readonly changedFiles: readonly string[]
  readonly diffEvidence?: readonly string[]
  readonly ciEvidence?: readonly string[]
  /** Diff-derived importer/imported edges, used only for AJNA-8 layering checks. */
  readonly importEdges?: readonly AjnaImportEdge[]
}

export interface AjnaGithubReviewNormalizerOptions {
  readonly requestId?: string
  readonly requireCiEvidence?: boolean
  readonly requireTestEvidence?: boolean
  readonly recommendedNextAction?: string
  readonly architecturePolicy?: AjnaArchitecturePolicy
  readonly securitySensitivePolicy?: AjnaSecuritySensitivePolicy
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

function assertStringArray(
  values: unknown,
  field: string,
  options: { readonly allowEmpty?: boolean } = {},
): void {
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

function assertImportEdges(value: unknown, field: string): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    throw new Error(`Ajna GitHub review payload ${field} must be an array.`)
  }
  value.forEach((entry, index) => {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as { importer?: unknown }).importer !== 'string' ||
      typeof (entry as { imported?: unknown }).imported !== 'string'
    ) {
      throw new Error(
        `Ajna GitHub review payload ${field}[${index}] must have string importer and imported fields.`,
      )
    }
  })
}

function createEvidenceFindings(
  payload: AjnaGithubPullRequestPayload,
  options: AjnaGithubReviewNormalizerOptions,
): AjnaReviewFinding[] {
  const findings: AjnaReviewFinding[] = []
  findings.push(
    ...detectAjnaSecuritySensitivePaths(payload.changedFiles, options.securitySensitivePolicy),
  )
  findings.push(
    ...detectAjnaArchitectureDrift({
      changedFiles: payload.changedFiles,
      ...(payload.importEdges === undefined ? {} : { importEdges: payload.importEdges }),
      ...(options.architecturePolicy === undefined ? {} : { policy: options.architecturePolicy }),
    }),
  )

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
      recommendation:
        'Review the normalized diff evidence before relying on merge-readiness output.',
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
      recommendation:
        'Confirm CI summaries match the current pull request head before merge decisions.',
      blocksMerge: false,
    })
  }

  return findings
}

export function normalizeGithubPullRequestForAjnaReview(
  payload: AjnaGithubPullRequestPayload,
  options: AjnaGithubReviewNormalizerOptions = {},
): SymbolWrightAjnaReviewPrInput {
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
  assertImportEdges(payload.importEdges, 'importEdges')

  const baseInput: SymbolWrightAjnaReviewPrInput = {
    request: createRequest(payload, options),
    findings: createEvidenceFindings(payload, options),
  }

  if (options.recommendedNextAction !== undefined) {
    return {
      ...baseInput,
      recommendedNextAction: options.recommendedNextAction,
    }
  }

  return baseInput
}
