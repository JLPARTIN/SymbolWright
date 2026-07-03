import type { CodemindProviderId } from './provider-adapter-contract.js'
import { CODEMIND_SUPPORTED_PROVIDER_IDS } from './provider-adapter-contract.js'
import type { ProviderGatewayConfig, ProviderResolvedConfig } from './provider-gateway.types.js'

export interface ProviderRuntimeOverrideInput {
  readonly baseUrl?: string
  readonly apiKey?: string
  readonly model?: string
  readonly displayName?: string
  readonly enabled?: boolean
}

export class ProviderRuntimeOverrideValidationError extends Error {}

function isSupportedProviderId(value: string): value is CodemindProviderId {
  return (CODEMIND_SUPPORTED_PROVIDER_IDS as readonly string[]).includes(value)
}

function assertValidHttpUrl(baseUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    throw new ProviderRuntimeOverrideValidationError(`baseUrl is not a valid URL: ${baseUrl}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ProviderRuntimeOverrideValidationError(
      `baseUrl must use http or https, got: ${parsed.protocol}`,
    )
  }
}

/**
 * Holds operator-supplied provider overrides in memory only. Overrides never touch
 * disk, so a "put an API from wherever" registration is scoped to the running
 * server process and is lost on restart (documented, not a bug).
 */
export class ProviderRuntimeOverrideStore {
  private readonly overrides = new Map<CodemindProviderId, ProviderRuntimeOverrideInput>()

  public set(providerId: string, input: ProviderRuntimeOverrideInput): CodemindProviderId {
    if (!isSupportedProviderId(providerId)) {
      throw new ProviderRuntimeOverrideValidationError(`Unknown provider: ${providerId}`)
    }
    if (input.baseUrl !== undefined) {
      assertValidHttpUrl(input.baseUrl)
    }
    if (input.apiKey !== undefined && input.apiKey.trim().length === 0) {
      throw new ProviderRuntimeOverrideValidationError('apiKey must not be blank')
    }

    const existing = this.overrides.get(providerId) ?? {}
    this.overrides.set(providerId, { ...existing, ...input })
    return providerId
  }

  public clear(providerId: string): void {
    if (!isSupportedProviderId(providerId)) {
      throw new ProviderRuntimeOverrideValidationError(`Unknown provider: ${providerId}`)
    }
    this.overrides.delete(providerId)
  }

  public clearAll(): void {
    this.overrides.clear()
  }

  public snapshot(): ReadonlyMap<CodemindProviderId, ProviderRuntimeOverrideInput> {
    return new Map(this.overrides)
  }
}

function mergeProvider(
  base: ProviderResolvedConfig,
  override: ProviderRuntimeOverrideInput | undefined,
): ProviderResolvedConfig {
  if (override === undefined) {
    return base
  }

  return {
    ...base,
    ...(override.displayName === undefined ? {} : { displayName: override.displayName }),
    ...(override.enabled === undefined ? {} : { enabled: override.enabled }),
    ...(override.baseUrl === undefined ? {} : { baseUrl: override.baseUrl }),
    ...(override.apiKey === undefined ? {} : { apiKey: override.apiKey }),
    ...(override.model === undefined ? {} : { defaultModel: override.model }),
  }
}

export function applyProviderRuntimeOverrides(
  base: ProviderGatewayConfig,
  overrides: ReadonlyMap<CodemindProviderId, ProviderRuntimeOverrideInput>,
): ProviderGatewayConfig {
  if (overrides.size === 0) {
    return base
  }

  const providers = Object.fromEntries(
    Object.entries(base.providers).map(([id, provider]) => [
      id,
      mergeProvider(provider, overrides.get(id as CodemindProviderId)),
    ]),
  ) as Record<CodemindProviderId, ProviderResolvedConfig>

  return { ...base, providers }
}
