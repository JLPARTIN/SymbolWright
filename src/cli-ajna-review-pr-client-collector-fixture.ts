import { readFileSync } from 'fs'

import { buildAjnaGithubPullRequestPayloadFromCollectorSnapshot } from './ajna/ajna-github-collector-contract.js'
import { createAjnaGithubReadOnlyClientCollectorPort } from './ajna/ajna-github-readonly-client-collector.js'
import type { AjnaGithubReadOnlyClientPort } from './ajna/ajna-github-readonly-client-port.js'
import { normalizeGithubPullRequestForAjnaReview } from './ajna/ajna-github-review-normalizer.js'
import {
  createAjnaClientCollectorFixtureClient,
  parseAjnaClientCollectorFixtureRequest,
} from './cli-ajna-client-collector-fixture.js'
import { buildAjnaReviewPrForInput } from './cli-ajna-review-pr.js'

export async function renderAjnaReviewPrClientCollectorFixtureForFile(
  inputPath: string,
  client: AjnaGithubReadOnlyClientPort = createAjnaClientCollectorFixtureClient(),
): Promise<string> {
  const request = parseAjnaClientCollectorFixtureRequest(readFileSync(inputPath, 'utf-8'))
  const collector = createAjnaGithubReadOnlyClientCollectorPort(client)
  const snapshot = await collector.collect(request)
  const githubPayload = buildAjnaGithubPullRequestPayloadFromCollectorSnapshot(snapshot)
  const input = normalizeGithubPullRequestForAjnaReview(githubPayload)
  return buildAjnaReviewPrForInput(input, inputPath).output
}
