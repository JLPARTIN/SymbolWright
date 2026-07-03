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
})

describe('UnlimitedRateLimiter', () => {
  it('always allows', () => {
    const limiter = new UnlimitedRateLimiter()
    for (let i = 0; i < 10; i++) {
      expect(limiter.consume('any')).toBe(true)
    }
  })
})
