import { describe, expect, it } from 'vitest'

import type { MissionImportedSource } from './mission-types.js'

describe('mission portability metadata', () => {
  it('records original mission id and import time without credentials', () => {
    const source: MissionImportedSource = {
      originalMissionId: 'mission_11111111-1111-4111-8111-111111111111',
      importedAt: '2026-07-20T00:00:00.000Z',
      exportedAt: '2026-07-19T00:00:00.000Z',
    }
    expect(source.originalMissionId).toContain('mission_')
    expect(source).not.toHaveProperty('apiKey')
  })
})
