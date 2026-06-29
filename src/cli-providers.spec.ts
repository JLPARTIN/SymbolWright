import { describe, expect, it } from 'vitest'

import { renderProvidersCommand } from './cli-providers.js'

describe('renderProvidersCommand', () => {
  it('renders provider list without exposing secrets', () => {
    const previous = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = 'openai-secret-value'

    try {
      const output = renderProvidersCommand(['list'])

      expect(output).toContain('CodeMind Providers')
      expect(output).toContain('openai')
      expect(output).toContain('key=configured')
      expect(output).not.toContain('openai-secret-value')
    } finally {
      if (previous === undefined) {
        delete process.env.OPENAI_API_KEY
      } else {
        process.env.OPENAI_API_KEY = previous
      }
    }
  })

  it('renders provider status', () => {
    const output = renderProvidersCommand(['status'])

    expect(output).toContain('CodeMind Provider Status')
    expect(output).toContain('Active provider:')
    expect(output).toContain('missing_credentials')
  })

  it('renders provider default models', () => {
    const output = renderProvidersCommand(['models'])

    expect(output).toContain('CodeMind Provider Models')
    expect(output).toContain('anthropic')
    expect(output).toContain('openai')
  })

  it('rejects unknown provider subcommands', () => {
    expect(() => renderProvidersCommand(['unknown'])).toThrow('Unknown providers subcommand')
  })
})
