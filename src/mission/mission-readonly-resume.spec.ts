import { describe, expect, it } from 'vitest'

import type { MissionRepositoryReconciliation } from './mission-types.js'

describe('mission read-only resume choice', () => {
  it('represents drift without requiring repository mutation', () => {
    const reconciliation: MissionRepositoryReconciliation = {
      repositoryAvailable: true,
      recordedBranch: 'feature',
      currentBranch: 'main',
      recordedHeadSha: 'abc',
      currentHeadSha: 'def',
      branchExists: true,
      hasDrift: true,
      warnings: ['Recorded branch differs from current branch'],
    }
    expect(reconciliation.hasDrift).toBe(true)
  })
})
