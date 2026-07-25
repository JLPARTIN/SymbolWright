import { readFileSync } from 'fs'

import { deriveAjnaMergeReadiness } from './ajna/ajna-merge-readiness.js'
import type {
  AjnaMergeReadiness,
  AjnaReviewFinding,
  AjnaReviewRequest,
} from './ajna/ajna-review.types.js'

export interface SymbolWrightAjnaMergeReadinessInput {
  readonly request: AjnaReviewRequest
  readonly findings: readonly AjnaReviewFinding[]
}

export interface SymbolWrightAjnaMergeReadinessCommandResult {
  readonly inputPath: string | null
  readonly readiness: AjnaMergeReadiness
  readonly output: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertString(value: Record<string, unknown>, field: string, path: string): void {
  if (typeof value[field] !== 'string' || value[field].length === 0) {
    throw new Error(`Ajna merge-readiness input ${path}.${field} must be a non-empty string.`)
  }
}

function assertBoolean(value: Record<string, unknown>, field: string, path: string): void {
  if (typeof value[field] !== 'boolean') {
    throw new Error(`Ajna merge-readiness input ${path}.${field} must be a boolean.`)
  }
}

function assertStringArray(value: Record<string, unknown>, field: string, path: string): void {
  if (!Array.isArray(value[field]) || !value[field].every((item) => typeof item === 'string')) {
    throw new Error(`Ajna merge-readiness input ${path}.${field} must be an array of strings.`)
  }
}

function assertReviewRequest(value: unknown): AjnaReviewRequest {
  if (!isRecord(value)) {
    throw new Error('Ajna merge-readiness input must include a request object.')
  }

  assertString(value, 'requestId', 'request')
  assertStringArray(value, 'changedFiles', 'request')
  assertBoolean(value, 'requireCiEvidence', 'request')
  assertBoolean(value, 'requireTestEvidence', 'request')

  if (!isRecord(value['subject'])) {
    throw new Error('Ajna merge-readiness input request.subject must be an object.')
  }

  assertString(value['subject'], 'repository', 'request.subject')
  assertString(value['subject'], 'baseRef', 'request.subject')
  assertString(value['subject'], 'headRef', 'request.subject')

  return value as unknown as AjnaReviewRequest
}

function assertAjnaMergeReadinessInput(value: unknown): SymbolWrightAjnaMergeReadinessInput {
  if (!isRecord(value)) {
    throw new Error('Ajna merge-readiness input must be a JSON object.')
  }

  const request = assertReviewRequest(value['request'])

  if (!Array.isArray(value['findings'])) {
    throw new Error('Ajna merge-readiness input must include a findings array.')
  }

  return {
    request,
    findings: value['findings'] as unknown as readonly AjnaReviewFinding[],
  }
}

export function parseAjnaMergeReadinessInput(
  jsonText: string,
): SymbolWrightAjnaMergeReadinessInput {
  return assertAjnaMergeReadinessInput(JSON.parse(jsonText) as unknown)
}

export function readAjnaMergeReadinessInput(
  inputPath: string,
): SymbolWrightAjnaMergeReadinessInput {
  return parseAjnaMergeReadinessInput(readFileSync(inputPath, 'utf-8'))
}

export function renderAjnaMergeReadiness(readiness: AjnaMergeReadiness): string {
  return [
    'Ajna merge-readiness',
    `Status: ${readiness.status}`,
    `Summary: ${readiness.summary}`,
    `Required evidence present: ${readiness.requiredEvidencePresent ? 'yes' : 'no'}`,
    `Operator decision required: ${readiness.operatorDecisionRequired ? 'yes' : 'no'}`,
    `Blocking finding IDs: ${readiness.blockingFindings.length > 0 ? readiness.blockingFindings.join(', ') : 'None'}`,
    '',
    'Mode: READ_ONLY',
  ].join('\n')
}

export function buildAjnaMergeReadinessForInput(
  input: SymbolWrightAjnaMergeReadinessInput,
  inputPath: string | null = null,
): SymbolWrightAjnaMergeReadinessCommandResult {
  const readiness = deriveAjnaMergeReadiness(input.request, input.findings)

  return {
    inputPath,
    readiness,
    output: renderAjnaMergeReadiness(readiness),
  }
}

export function renderAjnaMergeReadinessForFile(inputPath: string): string {
  return buildAjnaMergeReadinessForInput(readAjnaMergeReadinessInput(inputPath), inputPath).output
}
