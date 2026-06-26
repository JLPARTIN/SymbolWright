import { describe, expect, it } from 'vitest'

import {
  resolveProviderFromRoutePlan,
  createProviderInvocationReceipt,
  AGENT_KERNEL_PROVIDER_BRIDGE_BLOCK_ID,
} from './agent-kernel-provider-bridge.js'
import type { AgentKernelProviderRoutePlan } from './agent-kernel-provider-routing-gateway.js'
import {
  AGENT_KERNEL_PROVIDER_ROUTING_BLOCK_ID,
  AGENT_KERNEL_PROVIDER_ROUTING_PR_ID,
  AGENT_KERNEL_PROVIDER_ROUTING_PHASE_ID,
} from './agent-kernel-provider-routing-gateway.js'
import {
  createProviderRegistry,
  PROVIDER_ROUTE_LABEL_DEEP,
  PROVIDER_ROUTE_LABEL_LIGHTWEIGHT,
} from '../provider/provider-registry.js'
import type { LLMProvider } from '../provider/provider.types.js'

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

function makeRoutePlan(
  overrides: Partial<AgentKernelProviderRoutePlan> = {},
): AgentKernelProviderRoutePlan {
  return {
    blockId: AGENT_KERNEL_PROVIDER_ROUTING_BLOCK_ID,
    prId: AGENT_KERNEL_PROVIDER_ROUTING_PR_ID,
    phaseId: AGENT_KERNEL_PROVIDER_ROUTING_PHASE_ID,
    packetId: 'packet-1',
    routeType: 'DEEP_REASONING',
    providerRouteReady: true,
    providerInvoked: false,
    findings: [],
    rationale: [],
    selectedProvider: 'governed-deep-reasoning-provider',
    ...overrides,
  }
}

describe('agent-kernel-provider-bridge', () => {
  describe('AGENT_KERNEL_PROVIDER_BRIDGE_BLOCK_ID', () => {
    it('has expected value', () => {
      expect(AGENT_KERNEL_PROVIDER_BRIDGE_BLOCK_ID).toBe('AGENT-KERNEL-05-BRIDGE')
    })
  })

  describe('resolveProviderFromRoutePlan', () => {
    const registry = createProviderRegistry([
      {
        routeLabel: PROVIDER_ROUTE_LABEL_DEEP,
        provider: makeMockProvider('deep-provider'),
      },
      {
        routeLabel: PROVIDER_ROUTE_LABEL_LIGHTWEIGHT,
        provider: makeMockProvider('light-provider'),
      },
    ])

    it('resolves DEEP_REASONING to deep provider', () => {
      const plan = makeRoutePlan({ routeType: 'DEEP_REASONING' })
      const result = resolveProviderFromRoutePlan(plan, registry)

      expect(result.resolved).toBe(true)
      expect(result.provider?.providerId).toBe('deep-provider')
      expect(result.reason).toContain('deep-provider')
    })

    it('resolves AUDIT_REVIEW to deep provider', () => {
      const plan = makeRoutePlan({ routeType: 'AUDIT_REVIEW' })
      const result = resolveProviderFromRoutePlan(plan, registry)

      expect(result.resolved).toBe(true)
      expect(result.provider?.providerId).toBe('deep-provider')
    })

    it('resolves LIGHTWEIGHT_REASONING to lightweight provider', () => {
      const plan = makeRoutePlan({ routeType: 'LIGHTWEIGHT_REASONING' })
      const result = resolveProviderFromRoutePlan(plan, registry)

      expect(result.resolved).toBe(true)
      expect(result.provider?.providerId).toBe('light-provider')
    })

    it('returns not resolved for NO_ROUTE', () => {
      const plan = makeRoutePlan({ routeType: 'NO_ROUTE', providerRouteReady: true })
      const result = resolveProviderFromRoutePlan(plan, registry)

      expect(result.resolved).toBe(false)
      expect(result.provider).toBeUndefined()
      expect(result.reason).toContain('NO_ROUTE')
    })

    it('returns not resolved for LOCAL_ONLY', () => {
      const plan = makeRoutePlan({ routeType: 'LOCAL_ONLY', providerRouteReady: true })
      const result = resolveProviderFromRoutePlan(plan, registry)

      expect(result.resolved).toBe(false)
      expect(result.reason).toContain('LOCAL_ONLY')
    })

    it('returns not resolved when route plan is not ready', () => {
      const plan = makeRoutePlan({ providerRouteReady: false })
      const result = resolveProviderFromRoutePlan(plan, registry)

      expect(result.resolved).toBe(false)
      expect(result.reason).toContain('not ready')
    })

    it('returns not resolved when no provider registered', () => {
      const emptyRegistry = createProviderRegistry([])
      const plan = makeRoutePlan({ routeType: 'DEEP_REASONING' })
      const result = resolveProviderFromRoutePlan(plan, emptyRegistry)

      expect(result.resolved).toBe(false)
      expect(result.reason).toContain('No provider registered')
    })

    it('includes model override when present', () => {
      const registryWithOverride = createProviderRegistry([
        {
          routeLabel: PROVIDER_ROUTE_LABEL_DEEP,
          provider: makeMockProvider('deep-provider'),
          modelOverride: 'claude-opus-4-20250514',
        },
      ])

      const plan = makeRoutePlan({ routeType: 'DEEP_REASONING' })
      const result = resolveProviderFromRoutePlan(plan, registryWithOverride)

      expect(result.resolved).toBe(true)
      expect(result.modelOverride).toBe('claude-opus-4-20250514')
    })

    it('includes registry entry in result', () => {
      const plan = makeRoutePlan({ routeType: 'LIGHTWEIGHT_REASONING' })
      const result = resolveProviderFromRoutePlan(plan, registry)

      expect(result.entry).toBeDefined()
      expect(result.entry?.routeLabel).toBe(PROVIDER_ROUTE_LABEL_LIGHTWEIGHT)
    })
  })

  describe('createProviderInvocationReceipt', () => {
    it('creates receipt with all required fields', () => {
      const receipt = createProviderInvocationReceipt(
        'packet-1',
        'DEEP_REASONING',
        'anthropic',
        'claude-sonnet-4-20250514',
        { inputTokens: 1000, outputTokens: 500 },
        1234,
      )

      expect(receipt.bridgeBlockId).toBe('AGENT-KERNEL-05-BRIDGE')
      expect(receipt.packetId).toBe('packet-1')
      expect(receipt.routeType).toBe('DEEP_REASONING')
      expect(receipt.providerInvoked).toBe(true)
      expect(receipt.providerId).toBe('anthropic')
      expect(receipt.model).toBe('claude-sonnet-4-20250514')
      expect(receipt.inputTokens).toBe(1000)
      expect(receipt.outputTokens).toBe(500)
      expect(receipt.durationMs).toBe(1234)
      expect(receipt.timestamp).toBeTruthy()
    })

    it('includes cache usage when provided', () => {
      const receipt = createProviderInvocationReceipt(
        'packet-1',
        'DEEP_REASONING',
        'anthropic',
        'claude-sonnet-4-20250514',
        {
          inputTokens: 1000,
          outputTokens: 500,
          cacheReadInputTokens: 800,
          cacheCreationInputTokens: 200,
        },
        1234,
      )

      expect(receipt.cacheReadInputTokens).toBe(800)
      expect(receipt.cacheCreationInputTokens).toBe(200)
    })

    it('omits cache fields when not provided', () => {
      const receipt = createProviderInvocationReceipt(
        'packet-1',
        'LIGHTWEIGHT_REASONING',
        'anthropic',
        'claude-sonnet-4-20250514',
        { inputTokens: 100, outputTokens: 50 },
        500,
      )

      expect(receipt.cacheReadInputTokens).toBeUndefined()
      expect(receipt.cacheCreationInputTokens).toBeUndefined()
    })

    it('generates valid ISO timestamp', () => {
      const receipt = createProviderInvocationReceipt(
        'packet-1',
        'DEEP_REASONING',
        'anthropic',
        'claude-sonnet-4-20250514',
        { inputTokens: 100, outputTokens: 50 },
        500,
      )

      expect(() => new Date(receipt.timestamp)).not.toThrow()
      expect(new Date(receipt.timestamp).toISOString()).toBe(receipt.timestamp)
    })

    it('always sets providerInvoked to true', () => {
      const receipt = createProviderInvocationReceipt(
        'packet-1',
        'AUDIT_REVIEW',
        'anthropic',
        'claude-sonnet-4-20250514',
        { inputTokens: 100, outputTokens: 50 },
        500,
      )

      expect(receipt.providerInvoked).toBe(true)
    })
  })
})
