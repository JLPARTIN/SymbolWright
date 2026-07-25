import { describe, expect, it } from 'vitest'

import { resolveSymbolWrightConfig, validateSymbolWrightConfig } from './symbolwright-config.js'

describe('SymbolWright provider selection config', () => {
  it('resolves provider and model from CLI flags before env', () => {
    const config = resolveSymbolWrightConfig({
      cliFlags: { provider: 'google-gemini', model: 'gemini-test' },
      env: { SYMBOLWRIGHT_PROVIDER: 'openai', SYMBOLWRIGHT_MODEL: 'gpt-test' },
      homeConfigPath: '/missing-home-config.json',
      projectConfigPath: '/missing-project-config.json',
    })

    expect(config.provider).toBe('google-gemini')
    expect(config.model).toBe('gemini-test')
  })

  it('resolves provider and model from env', () => {
    const config = resolveSymbolWrightConfig({
      env: { SYMBOLWRIGHT_PROVIDER: 'openai', SYMBOLWRIGHT_MODEL: 'gpt-test' },
      homeConfigPath: '/missing-home-config.json',
      projectConfigPath: '/missing-project-config.json',
    })

    expect(config.provider).toBe('openai')
    expect(config.model).toBe('gpt-test')
  })

  it('does not require Anthropic credentials when a gateway provider is selected', () => {
    const result = validateSymbolWrightConfig({ provider: 'openai' })

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.redactedSummary.provider).toBe('openai')
  })

  it('still requires Anthropic credentials for default agent mode', () => {
    const result = validateSymbolWrightConfig({})

    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('ANTHROPIC_API_KEY')
  })
})
