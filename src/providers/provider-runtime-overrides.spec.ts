import { describe, expect, it } from 'vitest'

import { loadProviderGatewayConfig } from './provider-config.js'
import {
  applyProviderRuntimeOverrides,
  ProviderRuntimeOverrideStore,
  ProviderRuntimeOverrideValidationError,
} from './provider-runtime-overrides.js'

describe('ProviderRuntimeOverrideStore', () => {
  it('rejects unknown provider ids', () => {
    const store = new ProviderRuntimeOverrideStore()
    expect(() => store.set('not-a-real-provider', { apiKey: 'sk-test' })).toThrow(
      ProviderRuntimeOverrideValidationError,
    )
  })

  it('rejects malformed base urls', () => {
    const store = new ProviderRuntimeOverrideStore()
    expect(() => store.set('custom', { baseUrl: 'not a url' })).toThrow(
      ProviderRuntimeOverrideValidationError,
    )
    expect(() => store.set('custom', { baseUrl: 'ftp://example.com' })).toThrow(
      ProviderRuntimeOverrideValidationError,
    )
  })

  it('rejects blank api keys', () => {
    const store = new ProviderRuntimeOverrideStore()
    expect(() => store.set('custom', { apiKey: '   ' })).toThrow(
      ProviderRuntimeOverrideValidationError,
    )
  })

  it('merges repeated sets instead of overwriting the whole entry', () => {
    const store = new ProviderRuntimeOverrideStore()
    store.set('custom', { baseUrl: 'https://my-model-host.example.com/v1' })
    store.set('custom', { apiKey: 'sk-my-key', model: 'my-model' })

    const snapshot = store.snapshot()
    expect(snapshot.get('custom')).toEqual({
      baseUrl: 'https://my-model-host.example.com/v1',
      apiKey: 'sk-my-key',
      model: 'my-model',
    })
  })

  it('clears a single provider and clears all providers', () => {
    const store = new ProviderRuntimeOverrideStore()
    store.set('custom', { apiKey: 'sk-my-key' })
    store.set('openai', { apiKey: 'sk-other' })

    store.clear('custom')
    expect(store.snapshot().has('custom')).toBe(false)
    expect(store.snapshot().has('openai')).toBe(true)

    store.clearAll()
    expect(store.snapshot().size).toBe(0)
  })
})

describe('applyProviderRuntimeOverrides', () => {
  it('returns the same config untouched when there are no overrides', () => {
    const base = loadProviderGatewayConfig({})
    const merged = applyProviderRuntimeOverrides(base, new Map())
    expect(merged).toEqual(base)
  })

  it('lets an operator point the custom provider at any API they choose', () => {
    const base = loadProviderGatewayConfig({})
    const store = new ProviderRuntimeOverrideStore()
    store.set('custom', {
      baseUrl: 'https://my-model-host.example.com/v1',
      apiKey: 'sk-my-key',
      model: 'my-favorite-model',
      displayName: 'My Model Host',
    })

    const merged = applyProviderRuntimeOverrides(base, store.snapshot())

    expect(merged.providers.custom.baseUrl).toBe('https://my-model-host.example.com/v1')
    expect(merged.providers.custom.apiKey).toBe('sk-my-key')
    expect(merged.providers.custom.defaultModel).toBe('my-favorite-model')
    expect(merged.providers.custom.displayName).toBe('My Model Host')
    expect(merged.providers.openai).toEqual(base.providers.openai)
  })

  it('lets an override redirect a preset provider to a compatible proxy', () => {
    const base = loadProviderGatewayConfig({ OPENAI_API_KEY: 'sk-original' })
    const store = new ProviderRuntimeOverrideStore()
    store.set('openai', { baseUrl: 'https://my-proxy.example.com/v1' })

    const merged = applyProviderRuntimeOverrides(base, store.snapshot())

    expect(merged.providers.openai.baseUrl).toBe('https://my-proxy.example.com/v1')
    expect(merged.providers.openai.apiKey).toBe('sk-original')
  })
})
