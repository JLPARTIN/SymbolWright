import { describe, expect, it } from 'vitest'

import type { MissionListSummary } from './mission-types.js'

describe('mission list summary', () => {
  it('contains repository branch status validation change count and PR reference fields', () => {
    const summary: MissionListSummary = {
      id: 'mission_11111111-1111-4111-8111-111111111111',
      revision: 1,
      name: 'Summary',
      objective: 'Show it',
      status: 'ACTIVE',
      updatedAt: '2026-07-20T00:00:00.000Z',
      lastOpenedAt: '2026-07-20T00:00:00.000Z',
      repositoryName: 'JLPARTIN/CodeMind',
      repositoryRoot: '.',
      branch: 'feature',
      validationState: 'passed',
      changedFileCount: 2,
      pullRequestUrl: 'https://github.com/JLPARTIN/CodeMind/pull/1',
      labels: [],
    }
    expect(summary.repositoryName).toBe('JLPARTIN/CodeMind')
    expect(summary.changedFileCount).toBe(2)
  })
})
