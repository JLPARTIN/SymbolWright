import type { AgentAccessGrant, MissionExecutionLimits, SessionLimits } from './access-types.js'

const REQUIRED_EXECUTION_LIMITS = [
  'maxConcurrentMissions',
  'maxMissionDurationMinutes',
  'maxRepairAttempts',
  'maxFilesChanged',
  'maxDiffLines',
  'maxCommits',
  'maxDailyEstimatedCostUsd',
] as const

const REQUIRED_SESSION_LIMITS = [
  'maxConcurrentSessions',
  'maxSessionDurationMinutes',
  'inactivityTimeoutMinutes',
] as const

export function missingHostedDelegatedLimits(
  executionLimits: MissionExecutionLimits | undefined,
  sessionLimits: SessionLimits | undefined,
): readonly string[] {
  const missing: string[] = []
  for (const key of REQUIRED_EXECUTION_LIMITS) {
    if (executionLimits?.[key] === undefined) missing.push(`executionLimits.${key}`)
  }
  for (const key of REQUIRED_SESSION_LIMITS) {
    if (sessionLimits?.[key] === undefined) missing.push(`sessionLimits.${key}`)
  }
  return missing
}

export function grantMissingHostedDelegatedLimits(grant: AgentAccessGrant): readonly string[] {
  if (grant.status !== 'active' && grant.status !== 'pending' && grant.status !== 'paused')
    return []
  return missingHostedDelegatedLimits(grant.executionLimits, grant.sessionLimits)
}
