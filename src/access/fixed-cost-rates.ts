import type { ProviderTokenUsage } from '../provider/provider.types.js'

/**
 * `bigint` microdollars-per-million-tokens, the authoritative rate representation for hard budget
 * enforcement. `src/telemetry/cost-tracker.ts`'s float `CostRate`/`DEFAULT_COST_RATES` stay as
 * they are for the existing CLI-only display path -- this table is a separate, parallel
 * fixed-point source of truth for the governance path, not a replacement for it. Deliberately
 * keeps its own model-key entries (mirroring `DEFAULT_COST_RATES`' current models) rather than
 * deriving them from the float table at runtime, so a display-only rate change can never silently
 * change what money is actually enforced.
 */
export interface FixedCostRate {
  readonly inputMicrodollarsPerMillion: bigint
  readonly outputMicrodollarsPerMillion: bigint
  readonly cacheReadMicrodollarsPerMillion?: bigint
  readonly cacheCreationMicrodollarsPerMillion?: bigint
}

export const DEFAULT_FIXED_COST_RATES: Record<string, FixedCostRate> = {
  'claude-sonnet-4-20250514': {
    inputMicrodollarsPerMillion: 3_000_000n,
    outputMicrodollarsPerMillion: 15_000_000n,
    cacheReadMicrodollarsPerMillion: 300_000n,
    cacheCreationMicrodollarsPerMillion: 3_750_000n,
  },
  'claude-haiku-3-5-20241022': {
    inputMicrodollarsPerMillion: 800_000n,
    outputMicrodollarsPerMillion: 4_000_000n,
    cacheReadMicrodollarsPerMillion: 80_000n,
    cacheCreationMicrodollarsPerMillion: 1_000_000n,
  },
}

export class UnknownModelRateError extends Error {
  public constructor(public readonly model: string) {
    super(
      `No fixed-point cost rate is configured for model "${model}" -- refusing to guess for a ` +
        'budget-enforcement decision. Configure an explicit rate, a conservative fixed ' +
        'reservation, or reject the call for this budget-limited grant.',
    )
  }
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (numerator === 0n) return 0n
  return (numerator + denominator - 1n) / denominator
}

/**
 * Computes the exact integer microdollar cost of `usage` for `model`, rounding every component
 * up to the nearest microdollar -- ceiling, never floor, since a hard budget bound must never be
 * rounded down in the budget's favor. Throws `UnknownModelRateError` for a model with no
 * configured rate rather than silently substituting a generic fallback, since that fallback would
 * be exactly the failure mode this ledger exists to prevent when money enforcement is on the
 * line.
 */
export function computeFixedCostMicrodollars(
  usage: ProviderTokenUsage,
  model: string,
  rates: Record<string, FixedCostRate> = DEFAULT_FIXED_COST_RATES,
): bigint {
  const rate = rates[model]
  if (rate === undefined) throw new UnknownModelRateError(model)

  const million = 1_000_000n
  let total = 0n
  total += ceilDiv(BigInt(usage.inputTokens) * rate.inputMicrodollarsPerMillion, million)
  total += ceilDiv(BigInt(usage.outputTokens) * rate.outputMicrodollarsPerMillion, million)

  if (
    usage.cacheReadInputTokens !== undefined &&
    rate.cacheReadMicrodollarsPerMillion !== undefined
  ) {
    total += ceilDiv(
      BigInt(usage.cacheReadInputTokens) * rate.cacheReadMicrodollarsPerMillion,
      million,
    )
  }

  if (
    usage.cacheCreationInputTokens !== undefined &&
    rate.cacheCreationMicrodollarsPerMillion !== undefined
  ) {
    total += ceilDiv(
      BigInt(usage.cacheCreationInputTokens) * rate.cacheCreationMicrodollarsPerMillion,
      million,
    )
  }

  return total
}
