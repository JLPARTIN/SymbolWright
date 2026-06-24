import { readFileSync } from 'fs'

import {
  buildAjnaGithubPullRequestPayloadFromCollectorSnapshot,
  type AjnaGithubCollectorSnapshot,
} from './ajna/ajna-github-collector-contract.js'
import { normalizeGithubPullRequestForAjnaReview } from './ajna/ajna-github-review-normalizer.js'
import { buildAjnaReviewPrForInput } from './cli-ajna-review-pr.js'

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseAjnaGithubCollectorFixture(jsonText: string): AjnaGithubCollectorSnapshot {
  const parsed = JSON.parse(jsonText) as unknown
  if (!isObjectRecord(parsed)) {
    throw new Error('Ajna GitHub collector fixture must be an object.')
  }
  return parsed as unknown as AjnaGithubCollectorSnapshot
}

export function renderAjnaReviewPrCollectorFixtureForFile(inputPath: string): string {
  const snapshot = parseAjnaGithubCollectorFixture(readFileSync(inputPath, 'utf-8'))
  const payload = buildAjnaGithubPullRequestPayloadFromCollectorSnapshot(snapshot)
  const input = normalizeGithubPullRequestForAjnaReview(payload)
  return buildAjnaReviewPrForInput(input, inputPath).output
}
