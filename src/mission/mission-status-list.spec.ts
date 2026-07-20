import { describe, expect, it } from 'vitest'

import { MISSION_STATUSES } from './mission-types.js'

describe('mission lifecycle statuses', () => {
  it('supports active paused completed abandoned and failed', () => {
    expect(MISSION_STATUSES).toEqual(['ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED', 'FAILED'])
  })
})
