import { readFileSync } from 'fs'

import { deriveAjnaMergeReadiness } from './ajna/ajna-merge-readiness.js'
import type {
  AjnaMergeReadiness,
  AjnaReviewFinding,
  AjnaReviewRequest,
} from './ajna/ajna-review.types.js'

export interface CodemindAjnaMergeReadinessInput {
  readonly request: AjnaReviewRequest
  readonly findings: readonly AjnaReviewFinding[]
}

export interface CodemindAjnaMergeReadinessCommandResult {
  readonly inputPath: string | null
  readonly readiness: AjnaMergeReadiness
  readonly output: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertAjnaMergeReadinessInput(value: unknown): CodemindAjnaMergeReadinessInput {
  if (!isRecord(value)) {
    throw new Error('Ajna merge-readiness input must be a JSON object.')
  }

  if (!isRecord(value['request'])) {
    throw new Error('Ajna merge-readiness input must include a request object.')
  }

  if (!Array.isArray(value['findings'])) {
    throw new Error('Ajna merge-readiness input must include a findings array.')
  }

  return value as unknown as CodemindAjnaMergeReadinessInput
}

export function parseAjnaMergeReadinessInput(jsonText: string): CodemindAjnaMergeReadinessInput {
  return assertAjnaMergeReadinessInput(JSON.parse(jsonText) as unknown)
}

export function readAjnaMergeReadinessInput(inputPath: string): CodemindAjnaMergeReadinessInput {
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
    'Mode: READ_ONLY — no providers, writes, commands, or GitHub mutations allowed',
  ].join('\n')
}

export function buildAjnaMergeReadinessForInput(
  input: CodemindAjnaMergeReadinessInput,
  inputPath: string | null = null,
): CodemindAjnaMergeReadinessCommandResult {
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
