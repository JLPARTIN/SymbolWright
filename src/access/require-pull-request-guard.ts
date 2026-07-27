import type { AccessRuntime } from './access-runtime.js'

export interface PullRequestRequirementUnmet {
  readonly grantId: string
}

/**
 * Enforces `executionLimits.requirePullRequest` at the one point every mission-completion path
 * shares: `MissionService.complete`'s callers. A grant that declares this may not have a mission
 * it owns marked COMPLETED unless at least one pull request has actually been recorded against
 * that mission -- and `MissionService.recordPullRequest` is only ever called from a real,
 * GitHub-API-confirmed PR creation (see `github-intake-routes.ts`'s publish handler), never from
 * unverified caller-supplied input, so this can't be satisfied by simply claiming a URL.
 */
export function checkRequirePullRequest(
  accessRuntime: AccessRuntime,
  grantId: string,
  pullRequestUrls: readonly string[],
): PullRequestRequirementUnmet | undefined {
  const grant = accessRuntime.grantService.getGrant(grantId)
  if (grant?.executionLimits.requirePullRequest !== true) return undefined
  return pullRequestUrls.length === 0 ? { grantId } : undefined
}
