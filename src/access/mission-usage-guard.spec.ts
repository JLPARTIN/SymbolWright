import { describe, expect, it } from 'vitest'

import { checkUsageBudget } from './mission-usage-guard.js'

describe('checkUsageBudget', () => {
  it('allows any spend when no cap is configured', () => {
    expect(checkUsageBudget(1_000_000n, 1_000_000n, undefined)).toEqual({ allowed: true })
  })

  it('allows a call that stays within the cap', () => {
    expect(checkUsageBudget(100n, 50n, 200n)).toEqual({ allowed: true })
  })

  it('allows a call that lands exactly on the cap', () => {
    expect(checkUsageBudget(100n, 100n, 200n)).toEqual({ allowed: true })
  })

  it('denies a call that would push spend over the cap', () => {
    const decision = checkUsageBudget(150n, 100n, 200n)
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toMatch(/exceeding the configured cap/)
  })

  it('denies every call once a zero-dollar cap is configured', () => {
    expect(checkUsageBudget(0n, 1n, 0n)).toEqual({
      allowed: false,
      reason: expect.stringContaining('exceeding the configured cap') as unknown as string,
    })
  })

  it('allows a zero-cost estimate against a zero cap when nothing has been spent yet', () => {
    expect(checkUsageBudget(0n, 0n, 0n)).toEqual({ allowed: true })
  })

  it('denies a call when spend has already exceeded the cap, even with a zero-cost estimate', () => {
    const decision = checkUsageBudget(500n, 0n, 200n)
    expect(decision.allowed).toBe(false)
  })
})
