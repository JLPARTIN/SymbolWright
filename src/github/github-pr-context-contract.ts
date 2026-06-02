import type {
  CodemindGithubPrContextAdapterRequest,
  CodemindGithubPrContextAdapterResponse,
} from './github-pr-context.types.js'
import type { CodemindReadOnlyRepoContext } from '../repo-context/repo-context.types.js'

export function createReadOnlyGithubPrContextResponse(
  request: CodemindGithubPrContextAdapterRequest,
  context: CodemindReadOnlyRepoContext,
): CodemindGithubPrContextAdapterResponse {
  return {
    requestId: request.requestId,
    pullRequest: request.pullRequest,
    context,
    adapterMode: request.adapterMode,
    readOnly: true,
    githubWriteEnabled: false,
    commentsEnabled: false,
    mergeEnabled: false,
    networkRuntimeImplemented: false,
    notes: [
      'This contract response is read-only.',
      'GitHub write actions, PR comments, merge actions, and network runtime execution are disabled in this phase.',
    ],
  }
}

export function assertGithubPrContextIsReadOnly(
  response: CodemindGithubPrContextAdapterResponse,
): boolean {
  return (
    response.readOnly &&
    !response.githubWriteEnabled &&
    !response.commentsEnabled &&
    !response.mergeEnabled &&
    !response.networkRuntimeImplemented &&
    response.context.readOnly
  )
}
