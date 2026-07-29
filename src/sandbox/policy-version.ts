export interface PolicyVersionRead {
  readonly valid: boolean
  readonly value: number
}

/**
 * Reads an optional positive policy revision. Absence uses the trusted, code-owned fallback;
 * malformed operator input returns a zero sentinel so policy resolution can deny and live revision
 * checks can revoke rather than silently widening authority.
 */
export function readPolicyVersion(
  value: string | undefined,
  fallback: number,
): PolicyVersionRead {
  if (!Number.isSafeInteger(fallback) || fallback <= 0) {
    throw new Error('Policy version fallback must be a positive safe integer.')
  }
  if (value === undefined) return { valid: true, value: fallback }
  if (!/^[1-9]\d*$/.test(value)) return { valid: false, value: 0 }
  const parsed = Number(value)
  return Number.isSafeInteger(parsed)
    ? { valid: true, value: parsed }
    : { valid: false, value: 0 }
}
