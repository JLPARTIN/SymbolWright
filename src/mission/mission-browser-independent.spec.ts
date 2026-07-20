import { describe, expect, it } from 'vitest'

import { MissionStore } from './mission-store.js'

describe('mission browser independence', () => {
  it('uses a filesystem store rather than a browser API', () => {
    expect(MissionStore.toString()).not.toContain('localStorage')
  })
})
