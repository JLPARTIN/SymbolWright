export interface RateLimiter {
  /** Returns true if the caller identified by `key` may proceed. */
  consume(key: string): boolean
}

/** Fixed-window limiter: at most `limit` calls per `windowMs` per key. */
export class FixedWindowRateLimiter implements RateLimiter {
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
      return true
    }

    if (entry.count >= this.limit) {
      return false
    }

    entry.count += 1
    return true
  }
}

export class UnlimitedRateLimiter implements RateLimiter {
  public consume(_key?: string): boolean {
    return true
  }
}
