import type { IncomingMessage, ServerResponse } from 'node:http'

export interface MetricsSnapshot {
  readonly generatedAt: string
  readonly counters: Readonly<Record<string, number>>
  readonly gauges: Readonly<Record<string, number>>
}

export class MetricsRegistry {
  readonly #counters = new Map<string, number>()
  readonly #gauges = new Map<string, number>()
  readonly #tracked = new WeakSet<IncomingMessage>()

  public increment(name: string, amount = 1): void {
    this.#counters.set(name, (this.#counters.get(name) ?? 0) + amount)
  }

  public setGauge(name: string, value: number): void {
    this.#gauges.set(name, value)
  }

  public trackResponse(req: IncomingMessage, res: ServerResponse): void {
    if (this.#tracked.has(req)) return
    this.#tracked.add(req)
    this.increment('http_requests_total')
    this.setGauge('http_requests_active', (this.#gauges.get('http_requests_active') ?? 0) + 1)
    res.once('finish', () => {
      this.setGauge(
        'http_requests_active',
        Math.max(0, (this.#gauges.get('http_requests_active') ?? 1) - 1),
      )
      const bucket = Math.floor(res.statusCode / 100)
      if (bucket >= 1 && bucket <= 5) this.increment(`http_responses_${bucket}xx_total`)
      if (res.statusCode === 401) this.increment('http_authentication_failures_total')
      if (res.statusCode === 403) this.increment('http_authorization_denials_total')
      if (res.statusCode === 429) this.increment('http_rate_or_concurrency_limited_total')
      if (res.statusCode >= 500) this.increment('http_server_errors_total')
    })
  }

  public snapshot(): MetricsSnapshot {
    return {
      generatedAt: new Date().toISOString(),
      counters: Object.fromEntries(
        [...this.#counters.entries()].sort(([a], [b]) => a.localeCompare(b)),
      ),
      gauges: Object.fromEntries(
        [...this.#gauges.entries()].sort(([a], [b]) => a.localeCompare(b)),
      ),
    }
  }
}
