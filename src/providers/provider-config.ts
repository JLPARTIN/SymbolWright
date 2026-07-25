import {
  SYMBOLWRIGHT_PROVIDER_ADAPTERS,
  type SymbolWrightProviderId,
  findSymbolWrightProviderAdapter,
} from './provider-adapter-contract.js'
import type { ProviderGatewayConfig, ProviderResolvedConfig } from './provider-gateway.types.js'
import { readEnvWithLegacyFallback } from '../config/env-compat.js'

const DEFAULT_MODELS: Readonly<Record<SymbolWrightProviderId, string>> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  'google-gemini': 'gemini-1.5-flash',
  groq: 'llama-3.1-70b-versatile',
  openrouter: 'openai/gpt-4o-mini',
  'github-models': 'openai/gpt-4o-mini',
  ollama: 'llama3.1',
  deepseek: 'deepseek-chat',
  custom: 'custom-model',
}

const API_KEY_ENV: Readonly<Record<SymbolWrightProviderId, string | undefined>> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  'google-gemini': 'GOOGLE_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  'github-models': 'GITHUB_TOKEN',
  ollama: undefined,
  deepseek: 'DEEPSEEK_API_KEY',
  custom: 'SYMBOLWRIGHT_OPENAI_COMPATIBLE_API_KEY',
}

const LEGACY_API_KEY_ENV: Readonly<Record<SymbolWrightProviderId, string | undefined>> = {
  openai: undefined,
  anthropic: undefined,
  'google-gemini': undefined,
  groq: undefined,
  openrouter: undefined,
  'github-models': undefined,
  ollama: undefined,
  deepseek: undefined,
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

function readCompatEnv(
  env: ProviderGatewayEnv,
  canonicalKey: string,
  legacyKey: string,
): string | undefined {
  const value = readEnvWithLegacyFallback(canonicalKey, legacyKey, { env, sensitive: true })
  return value === undefined || value.trim().length === 0 ? undefined : value.trim()
}

export function parseProviderId(value: string | undefined): SymbolWrightProviderId | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  const adapter = findSymbolWrightProviderAdapter(normalized)
  return adapter?.id
}

export function parseProviderList(value: string | undefined): readonly SymbolWrightProviderId[] {
  if (value === undefined) {
    return []
  }

  const providers: SymbolWrightProviderId[] = []
  for (const entry of value.split(',')) {
    const providerId = parseProviderId(entry)
    if (providerId !== undefined && !providers.includes(providerId)) {
      providers.push(providerId)
    }
  }
  return providers
}

function resolveBaseUrl(providerId: SymbolWrightProviderId, env: ProviderGatewayEnv): string {
  if (providerId === 'custom') {
    return (
      readCompatEnv(
        env,
        'SYMBOLWRIGHT_OPENAI_COMPATIBLE_BASE_URL',
        'CODEMIND_OPENAI_COMPATIBLE_BASE_URL',
      ) ?? 'http://localhost:8000/v1'
    )
  }

  const adapter = findSymbolWrightProviderAdapter(providerId)
  return adapter?.defaultBaseUrl ?? 'http://localhost:8000/v1'
}

function resolveProviderConfig(
  providerId: SymbolWrightProviderId,
  env: ProviderGatewayEnv,
): ProviderResolvedConfig {
  const adapter = findSymbolWrightProviderAdapter(providerId)
  if (adapter === undefined) {
    throw new Error(`Unknown provider: ${providerId}`)
  }

  const apiKeyEnv = API_KEY_ENV[providerId]
  const legacyApiKeyEnv = LEGACY_API_KEY_ENV[providerId]
  const apiKey =
    apiKeyEnv === undefined
      ? undefined
      : legacyApiKeyEnv === undefined
        ? readEnv(env, apiKeyEnv)
        : readCompatEnv(env, apiKeyEnv, legacyApiKeyEnv)

  return {
    id: providerId,
    displayName: adapter.displayName,
    enabled:
      readCompatEnv(
        env,
        `SYMBOLWRIGHT_PROVIDER_${providerId.toUpperCase()}_DISABLED`,
        `CODEMIND_PROVIDER_${providerId.toUpperCase()}_DISABLED`,
      ) !== '1',
    baseUrl: resolveBaseUrl(providerId, env),
    ...(apiKey === undefined ? {} : { apiKey }),
    defaultModel: DEFAULT_MODELS[providerId],
    capabilities: adapter.capabilities,
  }
}

export function loadProviderGatewayConfig(
  env: ProviderGatewayEnv = process.env,
): ProviderGatewayConfig {
  const providers = Object.fromEntries(
    SYMBOLWRIGHT_PROVIDER_ADAPTERS.map((adapter) => [
      adapter.id,
      resolveProviderConfig(adapter.id, env),
    ]),
  ) as Record<SymbolWrightProviderId, ProviderResolvedConfig>
  const activeProvider = parseProviderId(
    readCompatEnv(env, 'SYMBOLWRIGHT_PROVIDER', 'CODEMIND_PROVIDER'),
  )
  const activeModel = readCompatEnv(env, 'SYMBOLWRIGHT_MODEL', 'CODEMIND_MODEL')

  return {
    ...(activeProvider === undefined ? {} : { activeProvider }),
    ...(activeModel === undefined ? {} : { activeModel }),
    fallbackProviders: parseProviderList(
      readCompatEnv(env, 'SYMBOLWRIGHT_PROVIDER_FALLBACKS', 'CODEMIND_PROVIDER_FALLBACKS'),
    ),
    providers,
  }
}
