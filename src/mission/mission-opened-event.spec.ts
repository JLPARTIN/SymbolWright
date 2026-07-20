import { describe, expect, it } from 'vitest'

import { createMissionEvent } from './mission-events.js'

describe('mission opened event', () => {
  it('supports mission.opened timeline evidence', () => {
    const event = createMissionEvent({
      missionId: 'mission_11111111-1111-4111-8111-111111111111',
      type: 'mission.opened', summary: 'Mission opened',
    })
    expect(event.type).toBe('mission.opened')
  })
})
