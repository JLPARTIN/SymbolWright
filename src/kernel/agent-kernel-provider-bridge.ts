import type { AgentKernelProviderRoutePlan } from './agent-kernel-provider-routing-gateway.js'
import type { LLMProvider } from '../provider/provider.types.js'
import type {
  ProviderRegistry,
  ProviderRegistryEntry,
} from '../provider/provider-registry.js'

export const AGENT_KERNEL_PROVIDER_BRIDGE_BLOCK_ID = 'AGENT-KERNEL-05-BRIDGE' as const

export interface AgentKernelProviderInvocationReceipt {
  readonly bridgeBlockId: typeof AGENT_KERNEL_PROVIDER_BRIDGE_BLOCK_ID
  readonly packetId: string
  readonly routeType: AgentKernelProviderRoutePlan['routeType']
  readonly providerInvoked: true
  readonly providerId: string
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadInputTokens?: number
  readonly cacheCreationInputTokens?: number
  readonly durationMs: number
  readonly timestamp: string
}

export interface AgentKernelProviderBridgeResult {
  readonly resolved: boolean
  readonly provider?: LLMProvider
  readonly modelOverride?: string
  readonly entry?: ProviderRegistryEntry
  readonly reason: string
}

export function resolveProviderFromRoutePlan(
  routePlan: AgentKernelProviderRoutePlan,
  registry: ProviderRegistry,
): AgentKernelProviderBridgeResult {
  if (!routePlan.providerRouteReady) {
    return {
      resolved: false,
      reason: 'Route plan is not ready for provider resolution.',
    }
  }

  if (routePlan.routeType === 'NO_ROUTE') {
    return {
      resolved: false,
      reason: 'Route type is NO_ROUTE; no provider resolution needed.',
    }
  }

  if (routePlan.routeType === 'LOCAL_ONLY') {
    return {
      resolved: false,
      reason: 'Route type is LOCAL_ONLY; provider invocation is not required.',
    }
  }

  const entry = registry.resolveForRouteType(routePlan.routeType)

  if (entry === undefined) {
    return {
      resolved: false,
      reason: `No provider registered for route type: ${routePlan.routeType}.`,
    }
  }

  return {
    resolved: true,
    provider: entry.provider,
    ...(entry.modelOverride !== undefined ? { modelOverride: entry.modelOverride } : {}),
    entry,
    reason: `Resolved provider '${entry.provider.providerId}' for route type '${routePlan.routeType}'.`,
  }
}

export function createProviderInvocationReceipt(
  packetId: string,
  routeType: AgentKernelProviderRoutePlan['routeType'],
  providerId: string,
  model: string,
  usage: {
    readonly inputTokens: number
    readonly outputTokens: number
    readonly cacheReadInputTokens?: number
    readonly cacheCreationInputTokens?: number
  },
  durationMs: number,
): AgentKernelProviderInvocationReceipt {
  return {
    bridgeBlockId: AGENT_KERNEL_PROVIDER_BRIDGE_BLOCK_ID,
    packetId,
    routeType,
    providerInvoked: true,
    providerId,
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    ...(usage.cacheReadInputTokens !== undefined
      ? { cacheReadInputTokens: usage.cacheReadInputTokens }
      : {}),
    ...(usage.cacheCreationInputTokens !== undefined
      ? { cacheCreationInputTokens: usage.cacheCreationInputTokens }
      : {}),
    durationMs,
    timestamp: new Date().toISOString(),
  }
}
