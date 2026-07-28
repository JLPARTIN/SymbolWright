/**
 * Fixed-point money for usage enforcement. `bigint` is used for every cost computation and
 * comparison inside the governance path (`governance-store.ts`, `mission-usage-guard.ts`,
 * `fixed-cost-rates.ts`) so a hard budget decision is never made on floating-point cents that can
 * silently drift. `bigint` never crosses a JSON boundary directly (`JSON.stringify` throws on it)
 * -- mission records, API responses, and audit events are all JSON-backed, so every persistence
 * and HTTP boundary encodes a microdollar amount as a canonical base-10 string through this one
 * codec pair, rather than an ad-hoc `.toString()` at each call site. SQLite columns stay native
 * signed-64-bit `INTEGER` and need no string encoding.
 */

const MAX_SQLITE_INTEGER = 9_223_372_036_854_775_807n
const MICRODOLLARS_PER_DOLLAR = 1_000_000n

export class InvalidMicrodollarsError extends Error {}

/** Encodes a non-negative microdollar `bigint` as a canonical base-10 string for a JSON field. */
export function serializeMicrodollars(value: bigint): string {
  if (value < 0n) {
    throw new InvalidMicrodollarsError(`Microdollar amount must not be negative: ${value}`)
  }
  return value.toString(10)
}

/** Parses a canonical base-10 microdollar string back into a `bigint`, rejecting anything that
 * isn't a non-negative integer literal or that exceeds SQLite's signed-64-bit `INTEGER` range. */
export function parseMicrodollars(value: string): bigint {
  if (!/^[0-9]+$/.test(value)) {
    throw new InvalidMicrodollarsError(`Not a canonical non-negative integer string: ${value}`)
  }
  const parsed = BigInt(value)
  if (parsed > MAX_SQLITE_INTEGER) {
    throw new InvalidMicrodollarsError(
      `Microdollar amount exceeds the representable range: ${value}`,
    )
  }
  return parsed
}

/** Converts an operator-authored USD budget figure (a plain number, matching the existing
 * `maxEstimatedCostUsd` config convention) into microdollars, rounding up so a budget config can
 * never be silently more permissive than the number an operator typed. */
export function usdToMicrodollars(usd: number): bigint {
  if (!Number.isFinite(usd) || usd < 0) {
    throw new InvalidMicrodollarsError(`USD amount must be a finite, non-negative number: ${usd}`)
  }
  // Scaled through integer cents-of-a-microdollar first so the rounding is exact for any
  // ordinary two-decimal USD figure rather than accumulating binary floating-point error.
  return BigInt(Math.ceil(usd * Number(MICRODOLLARS_PER_DOLLAR)))
}

/** Renders a microdollar amount as a human-readable USD string (display only, never used for
 * enforcement comparisons). */
export function microdollarsToUsdDisplay(value: bigint): string {
  const dollars = value / MICRODOLLARS_PER_DOLLAR
  const remainder = value % MICRODOLLARS_PER_DOLLAR
  const fractional = remainder.toString(10).padStart(6, '0')
  return `${dollars.toString(10)}.${fractional}`
}
