import { describe, expect, it } from 'vitest'

import { missingHostedDelegatedLimits } from './hosted-limit-policy.js'

describe('hosted delegated limit policy', () => {
  it('reports every missing mandatory limit', () => {
    expect(missingHostedDelegatedLimits(undefined, undefined)).toContain(
      'executionLimits.maxDailyEstimatedCostUsd',
    )
    expect(missingHostedDelegatedLimits(undefined, undefined)).toContain(
      'sessionLimits.maxConcurrentSessions',
    )
  })

  it('accepts a fully explicit limit set including a zero-dollar budget', () => {
    expect(
      missingHostedDelegatedLimits(
        {
          maxConcurrentMissions: 1,
          maxMissionDurationMinutes: 30,
          maxRepairAttempts: 2,
          maxFilesChanged: 20,
          maxDiffLines: 500,
          maxCommits: 3,
          maxDailyEstimatedCostUsd: 0,
        },
        {
          maxConcurrentSessions: 1,
          maxSessionDurationMinutes: 60,
          inactivityTimeoutMinutes: 10,
        },
      ),
    ).toEqual([])
  })
})
