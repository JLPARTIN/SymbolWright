import { describe, expect, it } from 'vitest'

import type { MissionCheckpointReference } from './mission-types.js'

describe('mission checkpoint boundary', () => {
  it('contains metadata links and no duplicated file snapshot content', () => {
    const reference: MissionCheckpointReference = {
      checkpointId: 'checkpoint-1', createdAt: '2026-07-20T00:00:00.000Z', paths: ['a.ts'], label: 'Before refactor',
    }
    expect(reference).not.toHaveProperty('files')
    expect(reference).not.toHaveProperty('originalContent')
  })
})
