import { describe, expect, it } from 'vitest'

import { CURRENT_MISSION_SCHEMA_VERSION } from './mission-types.js'

describe('mission schema version', () => {
  it('starts at version 1', () => {
    expect(CURRENT_MISSION_SCHEMA_VERSION).toBe(1)
  })
})
