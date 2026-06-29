import { describe, expect, it } from 'vitest'

import { resolveCodemindConfig, validateCodemindConfig } from './codemind-config.js'

describe('codemind provider config', () => {
  it('reads provider from env and CLI flags', () => {
    const fromEnv = resolveCodemindConfig({
      env: { CODEMIND_PROVIDER: 'openai' },
      homeConfigPath: '/nonexistent/config.json',
      projectConfigPath: '/nonexistent/config.json',
    })
    const fromCli = resolveCodemindConfig({
      cliFlags: { provider: 'google-gemini' },
      env: { CODEMIND_PROVIDER: 'openai' },
      homeConfigPath: '/nonexistent/config.json',
      projectConfigPath: '/nonexistent/config.json',
    })

    expect(fromEnv.provider).toBe('openai')
    expect(fromCli.provider).toBe('google-gemini')
  })

  it('does not require ANTHROPIC_API_KEY when a gateway provider is selected', () => {
    const result = validateCodemindConfig({ provider: 'openai' })

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.redactedSummary.provider).toBe('openai')
  })

  it('still requires ANTHROPIC_API_KEY for default Anthropic agent mode', () => {
    const result = validateCodemindConfig({ provider: 'anthropic' })

    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('ANTHROPIC_API_KEY')
  })
})
