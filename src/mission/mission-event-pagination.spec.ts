import { describe, expect, it } from 'vitest'

import { createMissionEvent, paginateMissionEvents } from './mission-events.js'

const ID = 'mission_11111111-1111-4111-8111-111111111111'

describe('mission event pagination bounds', () => {
  it('caps large limits and honors offsets', () => {
    const events = Array.from({ length: 600 }, (_, index) =>
      createMissionEvent({
        missionId: ID,
        type: 'agent.message.user',
        summary: `message ${index}`,
        timestamp: new Date(index * 1000).toISOString(),
      }),
    )
    const page = paginateMissionEvents(events, { offset: 50, limit: 9999 })
    expect(page.limit).toBe(500)
    expect(page.events).toHaveLength(500)
    expect(page.events[0]?.summary).toBe('message 50')
  })
})
