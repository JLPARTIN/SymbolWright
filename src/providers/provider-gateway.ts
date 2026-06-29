import type { CodemindProviderId } from './provider-adapter-contract.js'
import { findProviderGatewayAdapter } from './provider-adapters.js'
import { loadProviderGatewayConfig } from './provider-config.js'
import { ProviderGatewayError, normalizeProviderGatewayError } from './provider-errors.js'
import { FetchProviderHttpTransport } from './provider-http-transport.js'
import { redactProviderGatewayConfig } from './provider-redaction.js'
import type {
  ProviderGatewayAdapter,
  ProviderGatewayConfig,
  ProviderGatewayRequest,
  ProviderGatewayResponse,
  ProviderHttpTransport,
  ProviderStatusReport,
  RedactedProviderGatewayConfig,
} from './provider-gateway.types.js'

export interface ProviderGatewayOptions {
  readonly config?: ProviderGatewayConfig
  readonly transport?: ProviderHttpTransport
}

export class ProviderGateway {
  private readonly config: ProviderGatewayConfig
  private readonly transport: ProviderHttpTransport

  public constructor(options: ProviderGatewayOptions = {}) {
    this.config = options.config ?? loadProviderGatewayConfig()
    this.transport = options.transport ?? new FetchProviderHttpTransport()
  }

  public getRedactedConfig(): RedactedProviderGatewayConfig {
    return redactProviderGatewayConfig(this.config)
  }

  public getProviderStatuses(): readonly ProviderStatusReport[] {
    return Object.values(this.config.providers).map((provider) => {
      const adapter = this.resolveAdapter(provider.id)
      if (!provider.enabled) {
        return {
          providerId: provider.id,
          status: 'disabled',
          detail: `${provider.displayName} is disabled`,
          capabilities: provider.capabilities,
        }
      }

      if (adapter.requiredApiKey && provider.apiKey === undefined) {
        return {
          providerId: provider.id,
          status: 'missing_credentials',
          detail: `${provider.displayName} is missing credentials`,
          capabilities: provider.capabilities,
        }
      }

      return {
        providerId: provider.id,
        status: 'configured',
        detail: `${provider.displayName} is configured`,
        capabilities: provider.capabilities,
      }
    })
  }

  public async run(request: ProviderGatewayRequest): Promise<ProviderGatewayResponse> {
    const candidates = this.resolveProviderCandidates(request.providerId)
    let lastError: ProviderGatewayError | undefined

    for (const providerId of candidates) {
      try {
        return await this.runWithProvider(providerId, request)
      } catch (error) {
        lastError = normalizeProviderGatewayError(error)
        if (lastError.code !== 'MISSING_CREDENTIALS' && lastError.code !== 'PROVIDER_DISABLED') {
          throw lastError
        }
      }
    }

    throw (
      lastError ??
      new ProviderGatewayError('NO_AVAILABLE_PROVIDER', 'No configured provider was available')
    )
  }

  public async runWithProvider(
    providerId: CodemindProviderId,
    request: ProviderGatewayRequest,
  ): Promise<ProviderGatewayResponse> {
    const provider = this.config.providers[providerId]
    if (provider === undefined) {
      throw new ProviderGatewayError('UNKNOWN_PROVIDER', `Unknown provider: ${providerId}`, {
        providerId,
      })
    }

    if (!provider.enabled) {
      throw new ProviderGatewayError('PROVIDER_DISABLED', `${provider.displayName} is disabled`, {
        providerId,
      })
    }

    const adapter = this.resolveAdapter(providerId)
    if (adapter.requiredApiKey && provider.apiKey === undefined) {
      throw new ProviderGatewayError(
        'MISSING_CREDENTIALS',
        `${provider.displayName} API key is missing`,
        {
          providerId,
        },
      )
    }

    const plan = adapter.buildHttpPlan(request, provider)
    const response = await this.transport.request(plan.request)
    return plan.parser(response)
  }

  private resolveAdapter(providerId: CodemindProviderId): ProviderGatewayAdapter {
    const adapter = findProviderGatewayAdapter(providerId)
    if (adapter === undefined) {
      throw new ProviderGatewayError(
        'UNKNOWN_PROVIDER',
        `Unknown provider adapter: ${providerId}`,
        {
          providerId,
        },
      )
    }
    return adapter
  }

  private resolveProviderCandidates(
    requestedProvider?: CodemindProviderId,
  ): readonly CodemindProviderId[] {
    const primary = requestedProvider ?? this.config.activeProvider
    const candidates: CodemindProviderId[] = []

    if (primary !== undefined) {
      candidates.push(primary)
    }

    for (const fallback of this.config.fallbackProviders) {
      if (!candidates.includes(fallback)) {
        candidates.push(fallback)
      }
    }

    if (candidates.length === 0) {
      candidates.push('anthropic', 'openai', 'google-gemini', 'custom', 'ollama')
    }

    return candidates
  }
}

export async function runProviderGatewayRequest(
  request: ProviderGatewayRequest,
  options: ProviderGatewayOptions = {},
): Promise<ProviderGatewayResponse> {
  return new ProviderGateway(options).run(request)
}
