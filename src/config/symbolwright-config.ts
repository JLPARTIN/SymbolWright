import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

import type { SymbolWrightProviderId } from '../providers/provider-adapter-contract.js'
import { parseProviderId } from '../providers/provider-config.js'
import type { SymbolWrightRuntimeMode } from '../runtime/types.js'
import { normalizeSymbolWrightRuntimeMode } from '../runtime/policy/runtime-policy.js'

import { readEnvWithLegacyFallback } from './env-compat.js'

export type EmbeddingProviderType = 'voyage' | 'hash'

export interface SymbolWrightConfig {
  readonly anthropicApiKey?: string
  readonly githubToken?: string
  readonly provider?: SymbolWrightProviderId
  readonly model?: string
  readonly maxTokens?: number
  readonly baseURL?: string
  readonly embeddingProvider?: EmbeddingProviderType
  readonly voyageApiKey?: string
  readonly runtimeMode?: SymbolWrightRuntimeMode
}

interface RawConfigFile {
  readonly anthropicApiKey?: unknown
  readonly githubToken?: unknown
  readonly provider?: unknown
  readonly model?: unknown
  readonly maxTokens?: unknown
  readonly baseURL?: unknown
  readonly embeddingProvider?: unknown
  readonly voyageApiKey?: unknown
  readonly runtimeMode?: unknown
}

function loadJsonConfig(filePath: string): RawConfigFile | undefined {
  if (!existsSync(filePath)) {
    return undefined
  }
  try {
    const raw = readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as RawConfigFile
  } catch {
    return undefined
  }
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function positiveIntOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return undefined
}

export interface SymbolWrightConfigSources {
  readonly cliFlags?: Partial<SymbolWrightConfig>
  readonly env?: Record<string, string | undefined>
  readonly homeConfigPath?: string
  readonly projectConfigPath?: string
}

export function resolveSymbolWrightConfig(
  sources: SymbolWrightConfigSources = {},
): SymbolWrightConfig {
  const env = sources.env ?? process.env
  const homeConfigPath = sources.homeConfigPath ?? join(homedir(), '.symbolwright', 'config.json')
  const projectConfigPath =
    sources.projectConfigPath ?? join(process.cwd(), '.symbolwright', 'config.json')

  const homeConfig = loadJsonConfig(homeConfigPath)
  const projectConfig = loadJsonConfig(projectConfigPath)
  const cli = sources.cliFlags ?? {}

  const anthropicApiKey =
    stringOrUndefined(cli.anthropicApiKey) ??
    stringOrUndefined(env['ANTHROPIC_API_KEY']) ??
    stringOrUndefined(homeConfig?.anthropicApiKey) ??
    stringOrUndefined(projectConfig?.anthropicApiKey)

  const githubToken =
    stringOrUndefined(cli.githubToken) ??
    stringOrUndefined(env['GITHUB_TOKEN']) ??
    stringOrUndefined(homeConfig?.githubToken) ??
    stringOrUndefined(projectConfig?.githubToken)

  const provider =
    parseProviderId(stringOrUndefined(cli.provider)) ??
    parseProviderId(
      readEnvWithLegacyFallback('SYMBOLWRIGHT_PROVIDER', 'CODEMIND_PROVIDER', { env }),
    ) ??
    parseProviderId(stringOrUndefined(homeConfig?.provider)) ??
    parseProviderId(stringOrUndefined(projectConfig?.provider))

  const model =
    stringOrUndefined(cli.model) ??
    stringOrUndefined(readEnvWithLegacyFallback('SYMBOLWRIGHT_MODEL', 'CODEMIND_MODEL', { env })) ??
    stringOrUndefined(homeConfig?.model) ??
    stringOrUndefined(projectConfig?.model)

  const maxTokens =
    positiveIntOrUndefined(cli.maxTokens) ??
    positiveIntOrUndefined(
      readEnvWithLegacyFallback('SYMBOLWRIGHT_MAX_TOKENS', 'CODEMIND_MAX_TOKENS', { env }),
    ) ??
    positiveIntOrUndefined(homeConfig?.maxTokens) ??
    positiveIntOrUndefined(projectConfig?.maxTokens)

  const baseURL =
    stringOrUndefined(cli.baseURL) ??
    stringOrUndefined(
      readEnvWithLegacyFallback('SYMBOLWRIGHT_BASE_URL', 'CODEMIND_BASE_URL', { env }),
    ) ??
    stringOrUndefined(homeConfig?.baseURL) ??
    stringOrUndefined(projectConfig?.baseURL)

  const embeddingProviderRaw =
    stringOrUndefined(cli.embeddingProvider) ??
    stringOrUndefined(
      readEnvWithLegacyFallback('SYMBOLWRIGHT_EMBEDDING_PROVIDER', 'CODEMIND_EMBEDDING_PROVIDER', {
        env,
      }),
    ) ??
    stringOrUndefined(homeConfig?.embeddingProvider) ??
    stringOrUndefined(projectConfig?.embeddingProvider)

  const embeddingProvider: EmbeddingProviderType | undefined =
    embeddingProviderRaw === 'voyage' || embeddingProviderRaw === 'hash'
      ? embeddingProviderRaw
      : undefined

  const voyageApiKey =
    stringOrUndefined(cli.voyageApiKey) ??
    stringOrUndefined(env['VOYAGE_API_KEY']) ??
    stringOrUndefined(homeConfig?.voyageApiKey) ??
    stringOrUndefined(projectConfig?.voyageApiKey)

  const runtimeMode =
    normalizeSymbolWrightRuntimeMode(cli.runtimeMode) ??
    normalizeSymbolWrightRuntimeMode(
      readEnvWithLegacyFallback('SYMBOLWRIGHT_RUNTIME_MODE', 'CODEMIND_RUNTIME_MODE', { env }),
    ) ??
    normalizeSymbolWrightRuntimeMode(homeConfig?.runtimeMode) ??
    normalizeSymbolWrightRuntimeMode(projectConfig?.runtimeMode)

  return {
    ...(anthropicApiKey !== undefined ? { anthropicApiKey } : {}),
    ...(githubToken !== undefined ? { githubToken } : {}),
    ...(provider !== undefined ? { provider } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(baseURL !== undefined ? { baseURL } : {}),
    ...(embeddingProvider !== undefined ? { embeddingProvider } : {}),
    ...(voyageApiKey !== undefined ? { voyageApiKey } : {}),
    ...(runtimeMode !== undefined ? { runtimeMode } : {}),
  }
}

export function redactApiKey(key: string): string {
  if (key.length <= 8) {
    return '[REDACTED]'
  }
  return key.slice(0, 4) + '...' + key.slice(-4)
}

export interface SymbolWrightConfigValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
  readonly warnings: readonly string[]
  readonly redactedSummary: {
    readonly hasApiKey: boolean
    readonly apiKeyPreview?: string
    readonly hasGitHubToken: boolean
    readonly githubTokenPreview?: string
    readonly provider?: SymbolWrightProviderId
    readonly model?: string
    readonly maxTokens?: number
    readonly baseURL?: string
    readonly embeddingProvider?: EmbeddingProviderType
    readonly hasVoyageApiKey: boolean
    readonly runtimeMode?: SymbolWrightRuntimeMode
  }
}

export function validateSymbolWrightConfig(
  config: SymbolWrightConfig,
): SymbolWrightConfigValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const providerRequiresAnthropicKey =
    config.provider === undefined || config.provider === 'anthropic'
  if (providerRequiresAnthropicKey && config.anthropicApiKey === undefined) {
    errors.push(
      'Missing API key. Set ANTHROPIC_API_KEY environment variable or add anthropicApiKey to config.',
    )
  }

  if (config.maxTokens !== undefined && config.maxTokens < 1) {
    errors.push('maxTokens must be a positive integer.')
  }

  if (config.maxTokens !== undefined && config.maxTokens > 200000) {
    warnings.push('maxTokens exceeds 200000; this may cause API errors.')
  }

  if (config.baseURL !== undefined && !config.baseURL.startsWith('http')) {
    warnings.push('baseURL does not start with http/https.')
  }

  const hasApiKey = config.anthropicApiKey !== undefined
  const hasGitHubToken = config.githubToken !== undefined
  const hasVoyageApiKey = config.voyageApiKey !== undefined

  if (!hasGitHubToken) {
    warnings.push(
      'No GITHUB_TOKEN configured. GitHub live reads and writes will use fixture/fake clients.',
    )
  }

  if (config.embeddingProvider === 'voyage' && !hasVoyageApiKey) {
    warnings.push(
      'embeddingProvider is "voyage" but no VOYAGE_API_KEY is set; falling back to hash embeddings.',
    )
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    redactedSummary: {
      hasApiKey,
      ...(hasApiKey ? { apiKeyPreview: redactApiKey(config.anthropicApiKey!) } : {}),
      hasGitHubToken,
      ...(hasGitHubToken ? { githubTokenPreview: redactApiKey(config.githubToken!) } : {}),
      ...(config.provider !== undefined ? { provider: config.provider } : {}),
      ...(config.model !== undefined ? { model: config.model } : {}),
      ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
      ...(config.baseURL !== undefined ? { baseURL: config.baseURL } : {}),
      ...(config.embeddingProvider !== undefined
        ? { embeddingProvider: config.embeddingProvider }
        : {}),
      hasVoyageApiKey,
      ...(config.runtimeMode !== undefined ? { runtimeMode: config.runtimeMode } : {}),
    },
  }
}
