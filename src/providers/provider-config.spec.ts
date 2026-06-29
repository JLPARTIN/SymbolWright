import { describe, expect, it } from 'vitest'

import { loadProviderGatewayConfig, parseProviderList } from './provider-config.js'
import { redactProviderGatewayConfig, redactProviderSecret } from './provider-redaction.js'

describe('provider gateway config', () => {
  it('loads active provider, model, fallbacks, keys, and custom base URL from env', () => {
    const config = loadProviderGatewayConfig({
      CODEMIND_PROVIDER: 'openai',
      CODEMIND_MODEL: 'gpt-test',
      CODEMIND_PROVIDER_FALLBACKS: 'anthropic,google-gemini,openai',
      OPENAI_API_KEY: 'openai-secret',
      ANTHROPIC_API_KEY: 'anthropic-secret',
      GOOGLE_API_KEY: 'google-secret',
      CODEMIND_OPENAI_COMPATIBLE_BASE_URL: 'https://models.example.test/v1',
      CODEMIND_OPENAI_COMPATIBLE_API_KEY: 'custom-secret',
    })

    expect(config.activeProvider).toBe('openai')
    expect(config.activeModel).toBe('gpt-test')
    expect(config.fallbackProviders).toEqual(['anthropic', 'google-gemini', 'openai'])
    expect(config.providers.openai.apiKey).toBe('openai-secret')
    expect(config.providers.anthropic.apiKey).toBe('anthropic-secret')
    expect(config.providers['google-gemini'].apiKey).toBe('google-secret')
    expect(config.providers.custom.baseUrl).toBe('https://models.example.test/v1')
    expect(config.providers.custom.apiKey).toBe('custom-secret')
  })

  it('ignores unknown fallback providers', () => {
    expect(parseProviderList('openai,unknown,anthropic,openai')).toEqual(['openai', 'anthropic'])
  })

  it('redacts provider config without leaking secrets', () => {
    const config = loadProviderGatewayConfig({ OPENAI_API_KEY: 'sk-test-secret' })
    const redacted = redactProviderGatewayConfig(config)

    expect(JSON.stringify(redacted)).not.toContain('sk-test-secret')
    expect(redacted.providers.find((provider) => provider.id === 'openai')?.apiKey).toBe('configured')
  })

  it('masks standalone provider secrets', () => {
    expect(redactProviderSecret('sk-1234567890')).toBe('sk-***7890')
    expect(redactProviderSecret('short')).toBe('***')
  })
})
