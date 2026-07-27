export interface RateLimiter {
  /** Returns true if the caller identified by `key` may proceed. */
  consume(key: string): boolean
}

/** Fixed-window limiter: at most `limit` calls per `windowMs` per key. */
export class FixedWindowRateLimiter implements RateLimiter {
  /** Only sweep once the map has grown large enough that an O(n) pass is worth paying for --
   * the common case (few distinct keys: one operator IP, a handful of grant IDs) never pays this
   * cost at all. */
  private static readonly SWEEP_THRESHOLD = 10_000

  private readonly windows = new Map<string, { count: number; windowStart: number }>()

  public constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  public consume(key: string): boolean {
    const nowMs = this.now()
    const entry = this.windows.get(key)

    if (entry === undefined || nowMs - entry.windowStart >= this.windowMs) {
      this.windows.set(key, { count: 1, windowStart: nowMs })
      this.sweepExpiredIfLarge(nowMs)
      return true
    }

    if (entry.count >= this.limit) {
      return false
    }

    entry.count += 1
    return true
  }

  /** Exposed for tests/observability -- this limiter previously never forgot a key, so the map
   * grew without bound for the lifetime of the process (every distinct IP/grant ID that ever made
   * a request stayed in memory forever, even long after its window expired). */
  public get size(): number {
    return this.windows.size
  }

  private sweepExpiredIfLarge(nowMs: number): void {
    if (this.windows.size < FixedWindowRateLimiter.SWEEP_THRESHOLD) return
    for (const [key, entry] of this.windows) {
      if (nowMs - entry.windowStart >= this.windowMs) this.windows.delete(key)
    }
  }
}

export class UnlimitedRateLimiter implements RateLimiter {
  public consume(_key?: string): boolean {
    return true
  }
}
