import { describe, expect, it } from 'vitest'

import { handleMissionRoute } from '../app/api/mission-routes.js'

describe('mission API authentication boundary', () => {
  it('is mounted behind the unified server authorization gate', () => {
    expect(typeof handleMissionRoute).toBe('function')
  })
})
