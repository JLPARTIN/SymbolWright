import type {
  AjnaGithubApiCheckRunPayload,
  AjnaGithubApiCollectorPayload,
  AjnaGithubApiFilePayload,
  AjnaGithubApiPullRequestPayload,
} from './ajna-github-api-payload-adapter.js'
import {
  validateAjnaGithubReadOnlyCollectorRequest,
  type AjnaGithubReadOnlyCollectorRequest,
} from './ajna-github-readonly-collector-boundary.js'

export interface AjnaGithubReadOnlyCheckRunRef {
  readonly repository: string
  readonly ref: string
}

export interface AjnaGithubReadOnlyClientPort {
  readonly getPullRequest: (
    request: AjnaGithubReadOnlyCollectorRequest,
  ) => Promise<AjnaGithubApiPullRequestPayload>
  readonly listPullRequestFiles: (
    request: AjnaGithubReadOnlyCollectorRequest,
  ) => Promise<readonly AjnaGithubApiFilePayload[]>
  readonly listCheckRunsForRef: (
    request: AjnaGithubReadOnlyCheckRunRef,
  ) => Promise<readonly AjnaGithubApiCheckRunPayload[]>
}

export async function collectAjnaGithubApiPayloadFromReadOnlyClient(
  port: AjnaGithubReadOnlyClientPort,
  request: AjnaGithubReadOnlyCollectorRequest,
): Promise<AjnaGithubApiCollectorPayload> {
  const validRequest = validateAjnaGithubReadOnlyCollectorRequest(request)
  const pullRequest = await port.getPullRequest(validRequest)
  const files = await port.listPullRequestFiles(validRequest)
  const checkRuns = await port.listCheckRunsForRef({
    repository: pullRequest.repository,
    ref: pullRequest.head.sha ?? pullRequest.head.ref,
  })

  return {
    pullRequest,
    files,
    checkRuns,
  }
}
