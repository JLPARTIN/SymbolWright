import { describe, expect, it } from 'vitest'

import type { ProviderResolvedConfig } from '../providers/provider-gateway.types.js'
import {
  AgentProviderMissingCredentialsError,
  resolveAgentLlmProvider,
} from './symbolwright-agent-provider.js'

function config(overrides: Partial<ProviderResolvedConfig> = {}): ProviderResolvedConfig {
  return {
    id: 'openai',
    displayName: 'OpenAI',
    enabled: true,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    defaultModel: 'gpt-4o-mini',
    capabilities: ['chat', 'streaming', 'tool_use'],
    ...overrides,
  }
}

describe('resolveAgentLlmProvider', () => {
  it('builds a real google-gemini LLMProvider', () => {
    const provider = resolveAgentLlmProvider(
      config({
        id: 'google-gemini',
        displayName: 'Google Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
      }),
    )
    expect(provider.providerId).toBe('google-gemini')
  })

  it('requires a google-gemini API key', () => {
    const { apiKey: _apiKey, ...rest } = config({
      id: 'google-gemini',
      displayName: 'Google Gemini',
    })
    expect(() => resolveAgentLlmProvider(rest as ProviderResolvedConfig)).toThrow(
      AgentProviderMissingCredentialsError,
    )
  })

  it('builds a real anthropic LLMProvider', () => {
    const provider = resolveAgentLlmProvider(
      config({ id: 'anthropic', displayName: 'Anthropic', baseUrl: 'https://api.anthropic.com' }),
    )
    expect(provider.providerId).toBe('anthropic')
  })

  it('requires an anthropic API key', () => {
    const { apiKey: _apiKey, ...rest } = config({ id: 'anthropic', displayName: 'Anthropic' })
    expect(() => resolveAgentLlmProvider(rest as ProviderResolvedConfig)).toThrow(
      AgentProviderMissingCredentialsError,
    )
  })

  it('builds an OpenAI-compatible LLMProvider for openai, deepseek, and custom', () => {
    const { apiKey: _apiKey, ...customWithoutKey } = config({ id: 'custom', displayName: 'Custom' })
    expect(resolveAgentLlmProvider(config({ id: 'openai' })).providerId).toBe('openai')
    expect(
      resolveAgentLlmProvider(config({ id: 'deepseek', displayName: 'DeepSeek' })).providerId,
    ).toBe('deepseek')
    expect(resolveAgentLlmProvider(customWithoutKey as ProviderResolvedConfig).providerId).toBe(
      'custom',
    )
  })

  it('does not require an API key for ollama or custom', () => {
    const { apiKey: _ollamaKey, ...ollamaWithoutKey } = config({
      id: 'ollama',
      displayName: 'Ollama',
    })
    const { apiKey: _customKey, ...customWithoutKey } = config({
      id: 'custom',
      displayName: 'Custom',
    })
    expect(() => resolveAgentLlmProvider(ollamaWithoutKey as ProviderResolvedConfig)).not.toThrow()
    expect(() => resolveAgentLlmProvider(customWithoutKey as ProviderResolvedConfig)).not.toThrow()
  })

  it('requires an API key for openai-compatible vendor providers other than ollama/custom', () => {
    const { apiKey: _apiKey, ...rest } = config({ id: 'deepseek', displayName: 'DeepSeek' })
    expect(() => resolveAgentLlmProvider(rest as ProviderResolvedConfig)).toThrow(
      AgentProviderMissingCredentialsError,
    )
  })
})
