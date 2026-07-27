import { describe, expect, it } from 'vitest'

import { FixedWindowRateLimiter, UnlimitedRateLimiter } from './rate-limiter.js'

describe('FixedWindowRateLimiter', () => {
  it('allows calls up to the limit within the window', () => {
    const now = 0
    const limiter = new FixedWindowRateLimiter(3, 1000, () => now)

    expect(limiter.consume('ip-a')).toBe(true)
    expect(limiter.consume('ip-a')).toBe(true)
    expect(limiter.consume('ip-a')).toBe(true)
    expect(limiter.consume('ip-a')).toBe(false)
  })

  it('tracks each key independently', () => {
    const limiter = new FixedWindowRateLimiter(1, 1000, () => 0)

    expect(limiter.consume('ip-a')).toBe(true)
    expect(limiter.consume('ip-b')).toBe(true)
    expect(limiter.consume('ip-a')).toBe(false)
  })

  it('resets once the window elapses', () => {
    let now = 0
    const limiter = new FixedWindowRateLimiter(1, 1000, () => now)

    expect(limiter.consume('ip-a')).toBe(true)
    expect(limiter.consume('ip-a')).toBe(false)

    now = 1001
    expect(limiter.consume('ip-a')).toBe(true)
  })

  it('never sweeps below the threshold, so a small number of keys stays exactly as-is', () => {
    let now = 0
    const limiter = new FixedWindowRateLimiter(1, 1000, () => now)

    for (let i = 0; i < 50; i++) {
      now += 2000 // always past the window, so every call is a "new window" write
      limiter.consume(`ip-${i}`)
    }
    expect(limiter.size).toBe(50)
  })

  it('sweeps expired keys once the map grows past the threshold, bounding memory', () => {
    let now = 0
    const limiter = new FixedWindowRateLimiter(1, 1000, () => now)

    // Fill well past SWEEP_THRESHOLD (10_000) with keys whose window has already expired by the
    // time the next one is written -- regression test for the limiter that previously never
    // forgot a key, so this loop would have left 10_001 permanent entries in memory.
    for (let i = 0; i < 10_001; i++) {
      now += 2000
      limiter.consume(`ip-${i}`)
    }

    expect(limiter.size).toBeLessThan(10_001)
  })

  it('never sweeps away a key whose window is still active', () => {
    const now = 0
    const limiter = new FixedWindowRateLimiter(1, 1000, () => now)

    for (let i = 0; i < 10_001; i++) {
      limiter.consume(`ip-${i}`)
    }

    // Every one of these keys was written in the same (still-active) window, so a sweep must not
    // remove any of them even though the map is well past the threshold.
    expect(limiter.size).toBe(10_001)
    expect(limiter.consume('ip-0')).toBe(false) // still rate-limited, not silently forgotten
  })
})

describe('UnlimitedRateLimiter', () => {
  it('always allows', () => {
    const limiter = new UnlimitedRateLimiter()
    for (let i = 0; i < 10; i++) {
      expect(limiter.consume('any')).toBe(true)
    }
  })
})
