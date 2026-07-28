import { describe, expect, it } from 'vitest'

import {
  ConcurrencyLimitExceededError,
  ProviderConcurrencyGuard,
} from './provider-concurrency-guard.js'

describe('ProviderConcurrencyGuard', () => {
  it('allows acquisitions up to the configured limit', () => {
    const guard = new ProviderConcurrencyGuard({ provider: { limit: 2 } })
    const release1 = guard.acquire('provider')
    const release2 = guard.acquire('provider')
    expect(guard.activeCount('provider')).toBe(2)
    release1()
    release2()
  })

  it('throws ConcurrencyLimitExceededError once the pool is at capacity', () => {
    const guard = new ProviderConcurrencyGuard({ provider: { limit: 1 } })
    guard.acquire('provider')
    expect(() => guard.acquire('provider')).toThrow(ConcurrencyLimitExceededError)
  })

  it('frees a slot on release, allowing a subsequent acquire', () => {
    const guard = new ProviderConcurrencyGuard({ provider: { limit: 1 } })
    const release = guard.acquire('provider')
    release()
    expect(() => guard.acquire('provider')).not.toThrow()
  })

  it('release is idempotent -- calling it twice does not free two slots', () => {
    const guard = new ProviderConcurrencyGuard({ provider: { limit: 1 } })
    const release = guard.acquire('provider')
    release()
    release()
    expect(guard.activeCount('provider')).toBe(0)
  })

  it('treats an unconfigured pool as unlimited', () => {
    const guard = new ProviderConcurrencyGuard()
    for (let i = 0; i < 50; i++) guard.acquire('unbounded')
    expect(guard.activeCount('unbounded')).toBe(50)
  })

  it('keeps separate pools independent', () => {
    const guard = new ProviderConcurrencyGuard({ a: { limit: 1 }, b: { limit: 1 } })
    guard.acquire('a')
    expect(() => guard.acquire('b')).not.toThrow()
  })

  it('configurePool changes the limit for future acquisitions', () => {
    const guard = new ProviderConcurrencyGuard({ provider: { limit: 1 } })
    guard.acquire('provider')
    expect(() => guard.acquire('provider')).toThrow(ConcurrencyLimitExceededError)
    guard.configurePool('provider', 2)
    expect(() => guard.acquire('provider')).not.toThrow()
  })

  it('reports the configured limit via limitFor', () => {
    const guard = new ProviderConcurrencyGuard({ provider: { limit: 3 } })
    expect(guard.limitFor('provider')).toBe(3)
    expect(guard.limitFor('unconfigured')).toBeUndefined()
  })
})
