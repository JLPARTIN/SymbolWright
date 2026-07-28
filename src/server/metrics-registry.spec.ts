import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'

import { MetricsRegistry } from './metrics-registry.js'

describe('MetricsRegistry', () => {
  it('tracks each request once and records response classes', () => {
    const registry = new MetricsRegistry()
    const req = {} as IncomingMessage
    const res = Object.assign(new EventEmitter(), { statusCode: 429 }) as unknown as ServerResponse
    registry.trackResponse(req, res)
    registry.trackResponse(req, res)
    res.emit('finish')
    const snapshot = registry.snapshot()
    expect(snapshot.counters['http_requests_total']).toBe(1)
    expect(snapshot.counters['http_responses_4xx_total']).toBe(1)
    expect(snapshot.counters['http_rate_or_concurrency_limited_total']).toBe(1)
    expect(snapshot.gauges['http_requests_active']).toBe(0)
  })
})
