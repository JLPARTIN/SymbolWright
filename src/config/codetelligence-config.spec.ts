import { describe, expect, it } from 'vitest'

import {
  resolveCodemindConfig,
  resolveCodetelligenceConfig,
  validateCodemindConfig,
  validateCodetelligenceConfig,
} from './codemind-config.js'

const missing = '/nonexistent/codetelligence-config.json'

describe('Codetelligence config compatibility', () => {
  it('prefers CODETELLIGENCE variables over CODEMIND compatibility values', () => {
    const config = resolveCodetelligenceConfig({
      env: {
        CODETELLIGENCE_PROVIDER: 'openai',
        CODEMIND_PROVIDER: 'anthropic',
        CODETELLIGENCE_MODEL: 'gpt-new',
        CODEMIND_MODEL: 'claude-old',
        CODETELLIGENCE_MAX_TOKENS: '8192',
        CODEMIND_MAX_TOKENS: '4096',
        CODETELLIGENCE_RUNTIME_MODE: 'READ_ONLY',
        CODEMIND_RUNTIME_MODE: 'PLAN_ONLY',
      },
      homeConfigPath: missing,
      projectConfigPath: missing,
      legacyHomeConfigPath: missing,
      legacyProjectConfigPath: missing,
    })

    expect(config.provider).toBe('openai')
    expect(config.model).toBe('gpt-new')
    expect(config.maxTokens).toBe(8192)
    expect(config.runtimeMode).toBe('READ_ONLY')
  })

  it('continues to read legacy CODEMIND variables', () => {
    const config = resolveCodetelligenceConfig({
      env: {
        CODEMIND_PROVIDER: 'anthropic',
        CODEMIND_MODEL: 'claude-compatible',
        CODEMIND_BASE_URL: 'https://legacy.example.test',
        CODEMIND_EMBEDDING_PROVIDER: 'hash',
      },
      homeConfigPath: missing,
      projectConfigPath: missing,
      legacyHomeConfigPath: missing,
      legacyProjectConfigPath: missing,
    })

    expect(config.provider).toBe('anthropic')
    expect(config.model).toBe('claude-compatible')
    expect(config.baseURL).toBe('https://legacy.example.test')
    expect(config.embeddingProvider).toBe('hash')
  })

  it('keeps legacy resolver and validator aliases behaviorally identical', () => {
    const sources = {
      env: { CODETELLIGENCE_PROVIDER: 'openai' },
      homeConfigPath: missing,
      projectConfigPath: missing,
      legacyHomeConfigPath: missing,
      legacyProjectConfigPath: missing,
    }
    const config = resolveCodetelligenceConfig(sources)

    expect(resolveCodemindConfig(sources)).toEqual(config)
    expect(validateCodetelligenceConfig(config)).toEqual(validateCodemindConfig(config))
  })
})
