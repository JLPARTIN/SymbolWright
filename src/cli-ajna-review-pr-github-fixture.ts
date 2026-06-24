import { readFileSync } from 'fs'

import {
  normalizeGithubPullRequestForAjnaReview,
  type AjnaGithubPullRequestPayload,
} from './ajna/ajna-github-review-normalizer.js'
import { buildAjnaReviewPrForInput, type CodemindAjnaReviewPrCommandResult } from './cli-ajna-review-pr.js'

export interface CodemindAjnaReviewPrGithubFixtureCommandResult extends CodemindAjnaReviewPrCommandResult {
  readonly githubFixturePath: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseAjnaGithubPullRequestFixture(jsonText: string): AjnaGithubPullRequestPayload {
  const parsed = JSON.parse(jsonText) as unknown
  if (!isRecord(parsed)) {
    throw new Error('Ajna GitHub review fixture input must be an object.')
  }
  return parsed as unknown as AjnaGithubPullRequestPayload
}

export function readAjnaGithubPullRequestFixture(inputPath: string): AjnaGithubPullRequestPayload {
  return parseAjnaGithubPullRequestFixture(readFileSync(inputPath, 'utf-8'))
}

export function buildAjnaReviewPrForGithubFixture(
  payload: AjnaGithubPullRequestPayload,
  inputPath: string | null = null,
): CodemindAjnaReviewPrCommandResult {
  return buildAjnaReviewPrForInput(normalizeGithubPullRequestForAjnaReview(payload), inputPath)
}

export function renderAjnaReviewPrGithubFixtureForFile(inputPath: string): string {
  return buildAjnaReviewPrForGithubFixture(readAjnaGithubPullRequestFixture(inputPath), inputPath).output
}
