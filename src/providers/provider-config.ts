import {
  CODEMIND_PROVIDER_ADAPTERS,
  type CodemindProviderId,
  findCodemindProviderAdapter,
} from './provider-adapter-contract.js'
import type { ProviderGatewayConfig, ProviderResolvedConfig } from './provider-gateway.types.js'

const DEFAULT_MODELS: Readonly<Record<CodemindProviderId, string>> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  'google-gemini': 'gemini-1.5-flash',
  groq: 'llama-3.1-70b-versatile',
  openrouter: 'openai/gpt-4o-mini',
  'github-models': 'openai/gpt-4o-mini',
  ollama: 'llama3.1',
  custom: 'custom-model',
}

const API_KEY_ENV: Readonly<Record<CodemindProviderId, string | undefined>> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  'google-gemini': 'GOOGLE_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  'github-models': 'GITHUB_TOKEN',
  ollama: undefined,
  custom: 'CODEMIND_OPENAI_COMPATIBLE_API_KEY',
}

export type ProviderGatewayEnv = Readonly<Record<string, string | undefined>>

function readEnv(env: ProviderGatewayEnv, key: string): string | undefined {
  const value = env[key]
  if (value === undefined || value.trim().length === 0) {
    return undefined
  }
  return value.trim()
}

export function parseProviderId(value: string | undefined): CodemindProviderId | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  const adapter = findCodemindProviderAdapter(normalized)
  return adapter?.id
}

export function parseProviderList(value: string | undefined): readonly CodemindProviderId[] {
  if (value === undefined) {
    return []
  }

  const providers: CodemindProviderId[] = []
  for (const entry of value.split(',')) {
    const providerId = parseProviderId(entry)
    if (providerId !== undefined && !providers.includes(providerId)) {
      providers.push(providerId)
    }
  }
  return providers
}

function resolveBaseUrl(providerId: CodemindProviderId, env: ProviderGatewayEnv): string {
  if (providerId === 'custom') {
    return readEnv(env, 'CODEMIND_OPENAI_COMPATIBLE_BASE_URL') ?? 'http://localhost:8000/v1'
  }

  const adapter = findCodemindProviderAdapter(providerId)
  return adapter?.defaultBaseUrl ?? 'http://localhost:8000/v1'
}

function resolveProviderConfig(
  providerId: CodemindProviderId,
  env: ProviderGatewayEnv,
): ProviderResolvedConfig {
  const adapter = findCodemindProviderAdapter(providerId)
  if (adapter === undefined) {
    throw new Error(`Unknown provider: ${providerId}`)
  }

  const apiKeyEnv = API_KEY_ENV[providerId]
  const apiKey = apiKeyEnv === undefined ? undefined : readEnv(env, apiKeyEnv)

  return {
    id: providerId,
    displayName: adapter.displayName,
    enabled: readEnv(env, `CODEMIND_PROVIDER_${providerId.toUpperCase()}_DISABLED`) !== '1',
    baseUrl: resolveBaseUrl(providerId, env),
    ...(apiKey === undefined ? {} : { apiKey }),
    defaultModel: DEFAULT_MODELS[providerId],
    capabilities: adapter.capabilities,
  }
}

export function loadProviderGatewayConfig(env: ProviderGatewayEnv = process.env): ProviderGatewayConfig {
  const providers = Object.fromEntries(
    CODEMIND_PROVIDER_ADAPTERS.map((adapter) => [adapter.id, resolveProviderConfig(adapter.id, env)]),
  ) as Record<CodemindProviderId, ProviderResolvedConfig>
  const activeProvider = parseProviderId(readEnv(env, 'CODEMIND_PROVIDER'))
  const activeModel = readEnv(env, 'CODEMIND_MODEL')

  return {
    ...(activeProvider === undefined ? {} : { activeProvider }),
    ...(activeModel === undefined ? {} : { activeModel }),
    fallbackProviders: parseProviderList(readEnv(env, 'CODEMIND_PROVIDER_FALLBACKS')),
    providers,
  }
}
