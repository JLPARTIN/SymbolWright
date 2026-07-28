/**
 * In-memory concurrency limiter for the three pools that need one: active provider requests,
 * active SSE streams, and active autonomous executions. Deliberately in-memory, not part of
 * `governance-store.ts` -- concurrency is inherently process-local and doesn't need to survive a
 * restart, unlike money/daily-usage/reservations/durable rate limits, which do. Each pool is
 * capped independently; acquiring an over-cap slot throws `ConcurrencyLimitExceededError` so the
 * caller can answer `429` with a retry hint.
 */

export class ConcurrencyLimitExceededError extends Error {
  public constructor(
    public readonly pool: string,
    public readonly limit: number,
  ) {
    super(`Concurrency limit reached for "${pool}" (max ${limit} concurrent).`)
  }
}

export interface ConcurrencyPoolConfig {
  readonly limit: number
}

export class ProviderConcurrencyGuard {
  readonly #limits = new Map<string, number>()
  readonly #active = new Map<string, number>()

  public constructor(pools: Readonly<Record<string, ConcurrencyPoolConfig>> = {}) {
    for (const [pool, config] of Object.entries(pools)) {
      this.#limits.set(pool, config.limit)
    }
  }

  /** Registers (or replaces) the limit for a pool. Pools with no configured limit are treated as
   * unlimited -- `acquire` always succeeds for them. */
  public configurePool(pool: string, limit: number): void {
    this.#limits.set(pool, limit)
  }

  /** Reserves one slot in `pool`. Throws `ConcurrencyLimitExceededError` if the pool is already
   * at its configured limit. Always release the returned handle in a `finally` block -- the slot
   * is not freed automatically, including when the caller's own work throws or the client
   * disconnects mid-request. */
  public acquire(pool: string): () => void {
    const limit = this.#limits.get(pool)
    const current = this.#active.get(pool) ?? 0

    if (limit !== undefined && current >= limit) {
      throw new ConcurrencyLimitExceededError(pool, limit)
    }

    this.#active.set(pool, current + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      this.#active.set(pool, Math.max(0, (this.#active.get(pool) ?? 1) - 1))
    }
  }

  public activeCount(pool: string): number {
    return this.#active.get(pool) ?? 0
  }

  public limitFor(pool: string): number | undefined {
    return this.#limits.get(pool)
  }
}
