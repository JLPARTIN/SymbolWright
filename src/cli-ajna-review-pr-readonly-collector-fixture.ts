import { readFileSync } from 'fs'

import { buildAjnaGithubPullRequestPayloadFromCollectorSnapshot } from './ajna/ajna-github-collector-contract.js'
import {
  collectAjnaGithubReadOnlySnapshot,
  validateAjnaGithubReadOnlyCollectorRequest,
  type AjnaGithubReadOnlyCollectorPort,
  type AjnaGithubReadOnlyCollectorRequest,
} from './ajna/ajna-github-readonly-collector-boundary.js'
import { normalizeGithubPullRequestForAjnaReview } from './ajna/ajna-github-review-normalizer.js'
import { buildAjnaReviewPrForInput } from './cli-ajna-review-pr.js'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseAjnaReadOnlyCollectorReviewRequest(
  jsonText: string,
): AjnaGithubReadOnlyCollectorRequest {
  const parsed = JSON.parse(jsonText) as unknown
  if (!isObject(parsed)) {
    throw new Error('Ajna read-only collector review request must be an object.')
  }
  return validateAjnaGithubReadOnlyCollectorRequest(
    parsed as unknown as AjnaGithubReadOnlyCollectorRequest,
  )
}

export function createAjnaReadOnlyCollectorReviewPort(): AjnaGithubReadOnlyCollectorPort {
  return {
    collect: async (request) => ({
      pullRequest: {
        repository: request.repository,
        pullRequestNumber: request.pullRequestNumber,
        baseRef: 'main',
        headRef: `fixture-pr-${request.pullRequestNumber}`,
      },
      changedFiles: [
        { path: 'examples/ajna/github-readonly-collector-request.ready.json', status: 'modified' },
      ],
      checkRuns: [
        { name: 'Fixture Validate SymbolWright', status: 'completed', conclusion: 'success' },
      ],
    }),
  }
}

export async function renderAjnaReviewPrReadOnlyCollectorFixtureForFile(
  inputPath: string,
  port: AjnaGithubReadOnlyCollectorPort = createAjnaReadOnlyCollectorReviewPort(),
): Promise<string> {
  const request = parseAjnaReadOnlyCollectorReviewRequest(readFileSync(inputPath, 'utf-8'))
  const snapshot = await collectAjnaGithubReadOnlySnapshot(port, request)
  const payload = buildAjnaGithubPullRequestPayloadFromCollectorSnapshot(snapshot)
  const input = normalizeGithubPullRequestForAjnaReview(payload)
  return buildAjnaReviewPrForInput(input, inputPath).output
}
