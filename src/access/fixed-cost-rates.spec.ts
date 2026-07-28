import { describe, expect, it } from 'vitest'

import {
  computeFixedCostMicrodollars,
  DEFAULT_FIXED_COST_RATES,
  UnknownModelRateError,
} from './fixed-cost-rates.js'

describe('computeFixedCostMicrodollars', () => {
  it('computes exact cost for a known model with only input/output tokens', () => {
    const cost = computeFixedCostMicrodollars(
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      'claude-sonnet-4-20250514',
    )
    expect(cost).toBe(3_000_000n + 15_000_000n)
  })

  it('includes cache read and cache creation tokens when present', () => {
    const cost = computeFixedCostMicrodollars(
      {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 1_000_000,
        cacheCreationInputTokens: 1_000_000,
      },
      'claude-sonnet-4-20250514',
    )
    expect(cost).toBe(300_000n + 3_750_000n)
  })

  it('rounds up rather than down on a fractional microdollar result', () => {
    // 1 input token at 3,000,000 microdollars/million = 3 microdollars exactly (no rounding
    // needed to prove floor-vs-ceiling); pick a value that does not divide evenly instead.
    const cost = computeFixedCostMicrodollars(
      { inputTokens: 1, outputTokens: 0 },
      'claude-haiku-3-5-20241022',
    )
    // 800_000 / 1_000_000 = 0.8 microdollars -- ceiling must round up to 1, never down to 0.
    expect(cost).toBe(1n)
  })

  it('returns exactly zero for zero usage', () => {
    expect(
      computeFixedCostMicrodollars({ inputTokens: 0, outputTokens: 0 }, 'claude-sonnet-4-20250514'),
    ).toBe(0n)
  })

  it('throws UnknownModelRateError for a model with no configured rate, never silently guessing', () => {
    expect(() =>
      computeFixedCostMicrodollars(
        { inputTokens: 100, outputTokens: 100 },
        'totally-unknown-model',
      ),
    ).toThrow(UnknownModelRateError)
  })

  it('accepts a caller-supplied rate table overriding the default', () => {
    const cost = computeFixedCostMicrodollars(
      { inputTokens: 1_000_000, outputTokens: 0 },
      'custom-model',
      { 'custom-model': { inputMicrodollarsPerMillion: 42n, outputMicrodollarsPerMillion: 0n } },
    )
    expect(cost).toBe(42n)
  })

  it('every DEFAULT_FIXED_COST_RATES entry has non-negative rates', () => {
    for (const rate of Object.values(DEFAULT_FIXED_COST_RATES)) {
      expect(rate.inputMicrodollarsPerMillion).toBeGreaterThanOrEqual(0n)
      expect(rate.outputMicrodollarsPerMillion).toBeGreaterThanOrEqual(0n)
    }
  })
})
