import { describe, expect, it } from 'vitest'

import type { MissionListSummary } from './mission-types.js'

describe('mission second browser support', () => {
  it('includes revision in list summaries for optimistic concurrency', () => {
    const summary: MissionListSummary = {
      id: 'mission_11111111-1111-4111-8111-111111111111', revision: 3,
      name: 'Tabs', objective: 'Conflict safely', status: 'ACTIVE',
      updatedAt: '2026-07-20T00:00:00.000Z', lastOpenedAt: '2026-07-20T00:00:00.000Z',
      repositoryRoot: '.', changedFileCount: 0, labels: [],
    }
    expect(summary.revision).toBe(3)
  })
})
