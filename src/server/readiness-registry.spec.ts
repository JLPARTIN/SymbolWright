import { describe, expect, it } from 'vitest'

import { ReadinessRegistry } from './readiness-registry.js'

describe('ReadinessRegistry', () => {
  it('keeps the public response coarse while retaining authenticated detail', () => {
    const registry = new ReadinessRegistry()
    registry.setCheck('mission_store', false, 'corrupt record')
    expect(registry.publicSnapshot()).toEqual({ ready: false })
    expect(registry.detailedSnapshot().checks['mission_store']?.detail).toBe('corrupt record')
  })
})
