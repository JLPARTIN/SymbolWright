import { describe, expect, it } from 'vitest'

import { createMissionEvent } from './mission-events.js'

describe('mission event ids', () => {
  it('uses unique real event ids', () => {
    const input = {
      missionId: 'mission_11111111-1111-4111-8111-111111111111',
      type: 'mission.opened',
      summary: 'Opened',
    }
    expect(createMissionEvent(input).eventId).not.toBe(createMissionEvent(input).eventId)
  })
})
