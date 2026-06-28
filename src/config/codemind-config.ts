import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export type EmbeddingProviderType = 'voyage' | 'hash'

export interface CodemindConfig {
  readonly anthropicApiKey?: string
  readonly githubToken?: string
  readonly model?: string
  readonly maxTokens?: number
  readonly baseURL?: string
  readonly embeddingProvider?: EmbeddingProviderType
  readonly voyageApiKey?: string
}

interface RawConfigFile {
  readonly anthropicApiKey?: unknown
  readonly githubToken?: unknown
  readonly model?: unknown
  readonly maxTokens?: unknown
  readonly baseURL?: unknown
  readonly embeddingProvider?: unknown
  readonly voyageApiKey?: unknown
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

export interface CodemindConfigSources {
  readonly cliFlags?: Partial<CodemindConfig>
  readonly env?: Record<string, string | undefined>
  readonly homeConfigPath?: string
  readonly projectConfigPath?: string
}

export function resolveCodemindConfig(sources: CodemindConfigSources = {}): CodemindConfig {
  const env = sources.env ?? process.env
  const homeConfigPath = sources.homeConfigPath ?? join(homedir(), '.codemind', 'config.json')
  const projectConfigPath =
    sources.projectConfigPath ?? join(process.cwd(), '.codemind', 'config.json')

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

  const model =
    stringOrUndefined(cli.model) ??
    stringOrUndefined(env['CODEMIND_MODEL']) ??
    stringOrUndefined(homeConfig?.model) ??
    stringOrUndefined(projectConfig?.model)

  const maxTokens =
    positiveIntOrUndefined(cli.maxTokens) ??
    positiveIntOrUndefined(env['CODEMIND_MAX_TOKENS']) ??
    positiveIntOrUndefined(homeConfig?.maxTokens) ??
    positiveIntOrUndefined(projectConfig?.maxTokens)

  const baseURL =
    stringOrUndefined(cli.baseURL) ??
    stringOrUndefined(env['CODEMIND_BASE_URL']) ??
    stringOrUndefined(homeConfig?.baseURL) ??
    stringOrUndefined(projectConfig?.baseURL)

  const embeddingProviderRaw =
    stringOrUndefined(cli.embeddingProvider) ??
    stringOrUndefined(env['CODEMIND_EMBEDDING_PROVIDER']) ??
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

  return {
    ...(anthropicApiKey !== undefined ? { anthropicApiKey } : {}),
    ...(githubToken !== undefined ? { githubToken } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(baseURL !== undefined ? { baseURL } : {}),
    ...(embeddingProvider !== undefined ? { embeddingProvider } : {}),
    ...(voyageApiKey !== undefined ? { voyageApiKey } : {}),
  }
}

export function redactApiKey(key: string): string {
  if (key.length <= 8) {
    return '[REDACTED]'
  }
  return key.slice(0, 4) + '...' + key.slice(-4)
}

export interface CodemindConfigValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
  readonly warnings: readonly string[]
  readonly redactedSummary: {
    readonly hasApiKey: boolean
    readonly apiKeyPreview?: string
    readonly hasGitHubToken: boolean
    readonly githubTokenPreview?: string
    readonly model?: string
    readonly maxTokens?: number
    readonly baseURL?: string
    readonly embeddingProvider?: EmbeddingProviderType
    readonly hasVoyageApiKey: boolean
  }
}

export function validateCodemindConfig(config: CodemindConfig): CodemindConfigValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (config.anthropicApiKey === undefined) {
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
      ...(config.model !== undefined ? { model: config.model } : {}),
      ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
      ...(config.baseURL !== undefined ? { baseURL: config.baseURL } : {}),
      ...(config.embeddingProvider !== undefined
        ? { embeddingProvider: config.embeddingProvider }
        : {}),
      hasVoyageApiKey,
    },
  }
}
