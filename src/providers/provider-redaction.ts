import type { ProviderGatewayConfig, RedactedProviderGatewayConfig } from './provider-gateway.types.js'

const SECRET_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY',
  'GITHUB_TOKEN',
  'CODEMIND_OPENAI_COMPATIBLE_API_KEY',
] as const

export function redactProviderSecret(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value.length <= 8) {
    return '***'
  }

  return `${value.slice(0, 3)}***${value.slice(-4)}`
}

export function redactProviderText(text: string): string {
  let redacted = text

  for (const key of SECRET_ENV_KEYS) {
    const pattern = new RegExp(`${key}=([^\\s]+)`, 'g')
    redacted = redacted.replace(pattern, `${key}=***`)
  }

  return redacted
}

export function redactProviderGatewayConfig(
  config: ProviderGatewayConfig,
): RedactedProviderGatewayConfig {
  return {
    ...(config.activeProvider === undefined ? {} : { activeProvider: config.activeProvider }),
    ...(config.activeModel === undefined ? {} : { activeModel: config.activeModel }),
    fallbackProviders: config.fallbackProviders,
    providers: Object.values(config.providers).map((provider) => ({
      id: provider.id,
      displayName: provider.displayName,
      enabled: provider.enabled,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey === undefined ? 'missing' : 'configured',
      ...(provider.defaultModel === undefined ? {} : { defaultModel: provider.defaultModel }),
      capabilities: provider.capabilities,
    })),
  }
}
