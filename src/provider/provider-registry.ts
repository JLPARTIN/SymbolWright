import type { LLMProvider } from './provider.types.js'
import type { AgentKernelProviderRouteType } from '../kernel/agent-kernel-provider-routing-gateway.js'

export const PROVIDER_ROUTE_LABEL_DEEP = 'governed-deep-reasoning-provider' as const
export const PROVIDER_ROUTE_LABEL_LIGHTWEIGHT = 'governed-lightweight-reasoning-provider' as const

export type ProviderRouteLabel =
  typeof PROVIDER_ROUTE_LABEL_DEEP | typeof PROVIDER_ROUTE_LABEL_LIGHTWEIGHT

export interface ProviderRegistryEntry {
  readonly routeLabel: ProviderRouteLabel
  readonly provider: LLMProvider
  readonly modelOverride?: string
}

export interface ProviderRegistry {
  readonly entries: ReadonlyMap<ProviderRouteLabel, ProviderRegistryEntry>
  resolve(routeLabel: ProviderRouteLabel): ProviderRegistryEntry | undefined
  resolveForRouteType(routeType: AgentKernelProviderRouteType): ProviderRegistryEntry | undefined
}

function routeTypeToLabel(routeType: AgentKernelProviderRouteType): ProviderRouteLabel | undefined {
  switch (routeType) {
    case 'DEEP_REASONING':
    case 'AUDIT_REVIEW':
      return PROVIDER_ROUTE_LABEL_DEEP
    case 'LIGHTWEIGHT_REASONING':
      return PROVIDER_ROUTE_LABEL_LIGHTWEIGHT
    case 'NO_ROUTE':
    case 'LOCAL_ONLY':
      return undefined
  }
}

export function createProviderRegistry(
  entries: readonly ProviderRegistryEntry[],
): ProviderRegistry {
  const entryMap = new Map<ProviderRouteLabel, ProviderRegistryEntry>()

  for (const entry of entries) {
    entryMap.set(entry.routeLabel, entry)
  }

  return {
    entries: entryMap,

    resolve(routeLabel: ProviderRouteLabel): ProviderRegistryEntry | undefined {
      return entryMap.get(routeLabel)
    },

    resolveForRouteType(
      routeType: AgentKernelProviderRouteType,
    ): ProviderRegistryEntry | undefined {
      const label = routeTypeToLabel(routeType)
      if (label === undefined) {
        return undefined
      }
      return entryMap.get(label)
    },
  }
}
