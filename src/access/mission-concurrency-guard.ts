import type { AccessRuntime } from './access-runtime.js'

export interface ConcurrentMissionLimitExceeded {
  readonly activeCount: number
  readonly maxConcurrentMissions: number
}

/**
 * Shared by every entry point that can create a mission on behalf of a delegated grant (the
 * `/api/missions` route and GitHub repository intake) so `executionLimits.maxConcurrentMissions`
 * is enforced identically everywhere a grant can spend this budget, rather than each call site
 * re-implementing the same grant-lookup-then-count check and risking drift between them.
 */
export function checkConcurrentMissionLimit(
  accessRuntime: AccessRuntime,
  missionService: { countActiveMissionsForGrant(grantId: string): number },
  grantId: string,
): ConcurrentMissionLimitExceeded | undefined {
  const grant = accessRuntime.grantService.getGrant(grantId)
  const maxConcurrentMissions = grant?.executionLimits.maxConcurrentMissions
  if (maxConcurrentMissions === undefined) return undefined
  const activeCount = missionService.countActiveMissionsForGrant(grantId)
  return activeCount >= maxConcurrentMissions ? { activeCount, maxConcurrentMissions } : undefined
}
