import { readFileSync } from 'fs'

import {
  buildAjnaGithubCollectorSnapshotFromApiPayload,
  type AjnaGithubApiCollectorPayload,
} from './ajna/ajna-github-api-payload-adapter.js'
import { buildAjnaGithubPullRequestPayloadFromCollectorSnapshot } from './ajna/ajna-github-collector-contract.js'
import { normalizeGithubPullRequestForAjnaReview } from './ajna/ajna-github-review-normalizer.js'
import { buildAjnaReviewPrForInput } from './cli-ajna-review-pr.js'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseAjnaGithubApiReviewFixture(jsonText: string): AjnaGithubApiCollectorPayload {
  const parsed = JSON.parse(jsonText) as unknown
  if (!isObject(parsed)) {
    throw new Error('Ajna GitHub API review fixture must be an object.')
  }
  return parsed as unknown as AjnaGithubApiCollectorPayload
}

export function renderAjnaReviewPrGithubApiFixtureForFile(inputPath: string): string {
  const apiPayload = parseAjnaGithubApiReviewFixture(readFileSync(inputPath, 'utf-8'))
  const snapshot = buildAjnaGithubCollectorSnapshotFromApiPayload(apiPayload)
  const githubPayload = buildAjnaGithubPullRequestPayloadFromCollectorSnapshot(snapshot)
  const input = normalizeGithubPullRequestForAjnaReview(githubPayload)
  return buildAjnaReviewPrForInput(input, inputPath).output
}
