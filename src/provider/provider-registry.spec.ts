import { describe, expect, it } from 'vitest'

import {
  createProviderRegistry,
  PROVIDER_ROUTE_LABEL_DEEP,
  PROVIDER_ROUTE_LABEL_LIGHTWEIGHT,
  type ProviderRegistryEntry,
  type ProviderRouteLabel,
} from './provider-registry.js'
import type { LLMProvider } from './provider.types.js'

function makeMockProvider(id: string): LLMProvider {
  return {
    providerId: id,
    displayName: `Mock ${id}`,
    async *complete() {
      yield {
        type: 'message_stop' as const,
        stopReason: 'end_turn' as const,
        usage: { inputTokens: 0, outputTokens: 0 },
      }
    },
  }
}

function makeEntry(
  routeLabel: ProviderRouteLabel,
  providerId: string,
  modelOverride?: string,
): ProviderRegistryEntry {
  return {
    routeLabel,
    provider: makeMockProvider(providerId),
    ...(modelOverride !== undefined ? { modelOverride } : {}),
  }
}

describe('provider-registry', () => {
  describe('route label constants', () => {
    it('deep reasoning label matches AK-05 output', () => {
      expect(PROVIDER_ROUTE_LABEL_DEEP).toBe('governed-deep-reasoning-provider')
    })

    it('lightweight reasoning label matches AK-05 output', () => {
      expect(PROVIDER_ROUTE_LABEL_LIGHTWEIGHT).toBe('governed-lightweight-reasoning-provider')
    })
  })

  describe('createProviderRegistry', () => {
    it('creates a registry with no entries', () => {
      const registry = createProviderRegistry([])
      expect(registry.entries.size).toBe(0)
    })

    it('creates a registry with deep reasoning entry', () => {
      const entry = makeEntry(PROVIDER_ROUTE_LABEL_DEEP, 'deep-provider')
      const registry = createProviderRegistry([entry])

      expect(registry.entries.size).toBe(1)
      expect(registry.entries.has(PROVIDER_ROUTE_LABEL_DEEP)).toBe(true)
    })

    it('creates a registry with both entries', () => {
      const registry = createProviderRegistry([
        makeEntry(PROVIDER_ROUTE_LABEL_DEEP, 'deep-provider'),
        makeEntry(PROVIDER_ROUTE_LABEL_LIGHTWEIGHT, 'light-provider'),
      ])

      expect(registry.entries.size).toBe(2)
    })

    it('last entry wins for duplicate route labels', () => {
      const registry = createProviderRegistry([
        makeEntry(PROVIDER_ROUTE_LABEL_DEEP, 'first-provider'),
        makeEntry(PROVIDER_ROUTE_LABEL_DEEP, 'second-provider'),
      ])

      const resolved = registry.resolve(PROVIDER_ROUTE_LABEL_DEEP)
      expect(resolved?.provider.providerId).toBe('second-provider')
    })
  })

  describe('resolve', () => {
    it('returns entry for registered route label', () => {
      const registry = createProviderRegistry([
        makeEntry(PROVIDER_ROUTE_LABEL_DEEP, 'deep-provider'),
      ])

      const entry = registry.resolve(PROVIDER_ROUTE_LABEL_DEEP)
      expect(entry).toBeDefined()
      expect(entry?.provider.providerId).toBe('deep-provider')
      expect(entry?.routeLabel).toBe(PROVIDER_ROUTE_LABEL_DEEP)
    })

    it('returns undefined for unregistered route label', () => {
      const registry = createProviderRegistry([
        makeEntry(PROVIDER_ROUTE_LABEL_DEEP, 'deep-provider'),
      ])

      const entry = registry.resolve(PROVIDER_ROUTE_LABEL_LIGHTWEIGHT)
      expect(entry).toBeUndefined()
    })

    it('preserves model override in entry', () => {
      const registry = createProviderRegistry([
        makeEntry(PROVIDER_ROUTE_LABEL_DEEP, 'deep-provider', 'claude-opus-4-20250514'),
      ])

      const entry = registry.resolve(PROVIDER_ROUTE_LABEL_DEEP)
      expect(entry?.modelOverride).toBe('claude-opus-4-20250514')
    })
  })

  describe('resolveForRouteType', () => {
    const registry = createProviderRegistry([
      makeEntry(PROVIDER_ROUTE_LABEL_DEEP, 'deep-provider'),
      makeEntry(PROVIDER_ROUTE_LABEL_LIGHTWEIGHT, 'light-provider'),
    ])

    it('resolves DEEP_REASONING to deep reasoning provider', () => {
      const entry = registry.resolveForRouteType('DEEP_REASONING')
      expect(entry?.provider.providerId).toBe('deep-provider')
    })

    it('resolves AUDIT_REVIEW to deep reasoning provider', () => {
      const entry = registry.resolveForRouteType('AUDIT_REVIEW')
      expect(entry?.provider.providerId).toBe('deep-provider')
    })

    it('resolves LIGHTWEIGHT_REASONING to lightweight provider', () => {
      const entry = registry.resolveForRouteType('LIGHTWEIGHT_REASONING')
      expect(entry?.provider.providerId).toBe('light-provider')
    })

    it('returns undefined for NO_ROUTE', () => {
      const entry = registry.resolveForRouteType('NO_ROUTE')
      expect(entry).toBeUndefined()
    })

    it('returns undefined for LOCAL_ONLY', () => {
      const entry = registry.resolveForRouteType('LOCAL_ONLY')
      expect(entry).toBeUndefined()
    })

    it('returns undefined when no provider registered for route type', () => {
      const emptyRegistry = createProviderRegistry([])
      const entry = emptyRegistry.resolveForRouteType('DEEP_REASONING')
      expect(entry).toBeUndefined()
    })
  })
})
