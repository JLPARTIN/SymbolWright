import { describe, expect, it } from 'vitest'

import {
  InvalidMicrodollarsError,
  microdollarsToUsdDisplay,
  parseMicrodollars,
  serializeMicrodollars,
  usdToMicrodollars,
} from './microdollars.js'

describe('microdollars', () => {
  describe('serializeMicrodollars / parseMicrodollars', () => {
    it('round-trips a plain amount', () => {
      expect(parseMicrodollars(serializeMicrodollars(1_234_567n))).toBe(1_234_567n)
    })

    it('round-trips zero', () => {
      expect(parseMicrodollars(serializeMicrodollars(0n))).toBe(0n)
    })

    it('round-trips a value above Number.MAX_SAFE_INTEGER exactly', () => {
      const huge = BigInt(Number.MAX_SAFE_INTEGER) * 100n
      expect(parseMicrodollars(serializeMicrodollars(huge))).toBe(huge)
    })

    it('serializeMicrodollars rejects a negative amount', () => {
      expect(() => serializeMicrodollars(-1n)).toThrow(InvalidMicrodollarsError)
    })

    it('parseMicrodollars rejects a non-numeric string', () => {
      expect(() => parseMicrodollars('not-a-number')).toThrow(InvalidMicrodollarsError)
    })

    it('parseMicrodollars rejects a negative-looking string', () => {
      expect(() => parseMicrodollars('-5')).toThrow(InvalidMicrodollarsError)
    })

    it('parseMicrodollars rejects a decimal string', () => {
      expect(() => parseMicrodollars('1.5')).toThrow(InvalidMicrodollarsError)
    })

    it('parseMicrodollars rejects a value exceeding the SQLite INTEGER range', () => {
      expect(() => parseMicrodollars('99999999999999999999999999')).toThrow(
        InvalidMicrodollarsError,
      )
    })

    it('parseMicrodollars accepts the maximum representable SQLite INTEGER', () => {
      expect(parseMicrodollars('9223372036854775807')).toBe(9223372036854775807n)
    })
  })

  describe('usdToMicrodollars', () => {
    it('converts a whole-dollar amount exactly', () => {
      expect(usdToMicrodollars(3)).toBe(3_000_000n)
    })

    it('converts a fractional-cent amount, rounding up', () => {
      expect(usdToMicrodollars(0.1)).toBe(100_000n)
    })

    it('rounds up rather than down on an inexact float', () => {
      // 0.29 in IEEE-754 double is very slightly below the exact value; ceiling must still land
      // on a whole microdollar figure at least as large as the true amount.
      const result = usdToMicrodollars(0.29)
      expect(result).toBeGreaterThanOrEqual(290_000n)
    })

    it('rejects a negative amount', () => {
      expect(() => usdToMicrodollars(-1)).toThrow(InvalidMicrodollarsError)
    })

    it('rejects a non-finite amount', () => {
      expect(() => usdToMicrodollars(Number.POSITIVE_INFINITY)).toThrow(InvalidMicrodollarsError)
      expect(() => usdToMicrodollars(Number.NaN)).toThrow(InvalidMicrodollarsError)
    })

    it('treats zero as valid', () => {
      expect(usdToMicrodollars(0)).toBe(0n)
    })
  })

  describe('microdollarsToUsdDisplay', () => {
    it('renders a whole-dollar amount', () => {
      expect(microdollarsToUsdDisplay(3_000_000n)).toBe('3.000000')
    })

    it('renders a sub-dollar amount with zero-padded fraction', () => {
      expect(microdollarsToUsdDisplay(1_500n)).toBe('0.001500')
    })

    it('renders zero', () => {
      expect(microdollarsToUsdDisplay(0n)).toBe('0.000000')
    })
  })
})
