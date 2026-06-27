import { describe, expect, it } from 'vitest'

import {
  resolveCodemindConfig,
  redactApiKey,
  validateCodemindConfig,
  type CodemindConfig,
} from './codemind-config.js'

describe('codemind-config', () => {
  describe('resolveCodemindConfig', () => {
    it('returns empty config when no sources provided', () => {
      const config = resolveCodemindConfig({
        env: {},
        homeConfigPath: '/nonexistent/config.json',
        projectConfigPath: '/nonexistent/config.json',
      })

      expect(config.anthropicApiKey).toBeUndefined()
      expect(config.model).toBeUndefined()
      expect(config.maxTokens).toBeUndefined()
      expect(config.baseURL).toBeUndefined()
    })

    it('reads API key from env', () => {
      const config = resolveCodemindConfig({
        env: { ANTHROPIC_API_KEY: 'sk-test-key-12345678' },
        homeConfigPath: '/nonexistent/config.json',
        projectConfigPath: '/nonexistent/config.json',
      })

      expect(config.anthropicApiKey).toBe('sk-test-key-12345678')
    })

    it('reads model from env', () => {
      const config = resolveCodemindConfig({
        env: { CODEMIND_MODEL: 'claude-opus-4-20250514' },
        homeConfigPath: '/nonexistent/config.json',
        projectConfigPath: '/nonexistent/config.json',
      })

      expect(config.model).toBe('claude-opus-4-20250514')
    })

    it('reads maxTokens from env', () => {
      const config = resolveCodemindConfig({
        env: { CODEMIND_MAX_TOKENS: '4096' },
        homeConfigPath: '/nonexistent/config.json',
        projectConfigPath: '/nonexistent/config.json',
      })

      expect(config.maxTokens).toBe(4096)
    })

    it('reads GitHub token from env', () => {
      const config = resolveCodemindConfig({
        env: { GITHUB_TOKEN: 'ghp_test1234567890abcdef' },
        homeConfigPath: '/nonexistent/config.json',
        projectConfigPath: '/nonexistent/config.json',
      })

      expect(config.githubToken).toBe('ghp_test1234567890abcdef')
    })

    it('CLI flags override env for GitHub token', () => {
      const config = resolveCodemindConfig({
        cliFlags: { githubToken: 'cli-token-abcdef1234' },
        env: { GITHUB_TOKEN: 'env-token-xyz' },
        homeConfigPath: '/nonexistent/config.json',
        projectConfigPath: '/nonexistent/config.json',
      })

      expect(config.githubToken).toBe('cli-token-abcdef1234')
    })

    it('ignores empty GitHub token', () => {
      const config = resolveCodemindConfig({
        env: { GITHUB_TOKEN: '' },
        homeConfigPath: '/nonexistent/config.json',
        projectConfigPath: '/nonexistent/config.json',
      })

      expect(config.githubToken).toBeUndefined()
    })

    it('reads baseURL from env', () => {
      const config = resolveCodemindConfig({
        env: { CODEMIND_BASE_URL: 'https://custom.api.example.com' },
        homeConfigPath: '/nonexistent/config.json',
        projectConfigPath: '/nonexistent/config.json',
      })

      expect(config.baseURL).toBe('https://custom.api.example.com')
    })

    it('CLI flags take highest priority over env', () => {
      const config = resolveCodemindConfig({
        cliFlags: {
          anthropicApiKey: 'cli-key',
          model: 'cli-model',
          maxTokens: 1024,
        },
        env: {
          ANTHROPIC_API_KEY: 'env-key',
          CODEMIND_MODEL: 'env-model',
          CODEMIND_MAX_TOKENS: '8192',
        },
        homeConfigPath: '/nonexistent/config.json',
        projectConfigPath: '/nonexistent/config.json',
      })

      expect(config.anthropicApiKey).toBe('cli-key')
      expect(config.model).toBe('cli-model')
      expect(config.maxTokens).toBe(1024)
    })

    it('ignores empty string env values', () => {
      const config = resolveCodemindConfig({
        env: { ANTHROPIC_API_KEY: '', CODEMIND_MODEL: '' },
        homeConfigPath: '/nonexistent/config.json',
        projectConfigPath: '/nonexistent/config.json',
      })

      expect(config.anthropicApiKey).toBeUndefined()
      expect(config.model).toBeUndefined()
    })

    it('ignores invalid maxTokens values', () => {
      const config = resolveCodemindConfig({
        env: { CODEMIND_MAX_TOKENS: 'not-a-number' },
        homeConfigPath: '/nonexistent/config.json',
        projectConfigPath: '/nonexistent/config.json',
      })

      expect(config.maxTokens).toBeUndefined()
    })

    it('ignores negative maxTokens values', () => {
      const config = resolveCodemindConfig({
        env: { CODEMIND_MAX_TOKENS: '-100' },
        homeConfigPath: '/nonexistent/config.json',
        projectConfigPath: '/nonexistent/config.json',
      })

      expect(config.maxTokens).toBeUndefined()
    })

    it('handles non-existent config files gracefully', () => {
      const config = resolveCodemindConfig({
        env: {},
        homeConfigPath: '/tmp/definitely-does-not-exist-xyz/config.json',
        projectConfigPath: '/tmp/definitely-does-not-exist-abc/config.json',
      })

      expect(config.anthropicApiKey).toBeUndefined()
    })
  })

  describe('redactApiKey', () => {
    it('redacts long keys showing first 4 and last 4 chars', () => {
      expect(redactApiKey('sk-test-1234567890abcdef')).toBe('sk-t...cdef')
    })

    it('fully redacts short keys', () => {
      expect(redactApiKey('short')).toBe('[REDACTED]')
    })

    it('fully redacts keys of exactly 8 chars', () => {
      expect(redactApiKey('12345678')).toBe('[REDACTED]')
    })

    it('redacts keys of 9+ chars', () => {
      expect(redactApiKey('123456789')).toBe('1234...6789')
    })
  })

  describe('validateCodemindConfig', () => {
    it('valid config with API key', () => {
      const config: CodemindConfig = {
        anthropicApiKey: 'sk-test-key-12345678',
        model: 'claude-sonnet-4-20250514',
        maxTokens: 8192,
      }

      const result = validateCodemindConfig(config)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.redactedSummary.hasApiKey).toBe(true)
      expect(result.redactedSummary.apiKeyPreview).not.toContain('sk-test-key')
    })

    it('invalid when API key missing', () => {
      const config: CodemindConfig = {}

      const result = validateCodemindConfig(config)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]).toContain('API key')
      expect(result.redactedSummary.hasApiKey).toBe(false)
      expect(result.redactedSummary.apiKeyPreview).toBeUndefined()
    })

    it('warns when maxTokens exceeds 200000', () => {
      const config: CodemindConfig = {
        anthropicApiKey: 'sk-test-key-12345678',
        maxTokens: 300000,
      }

      const result = validateCodemindConfig(config)
      expect(result.valid).toBe(true)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain('200000')
    })

    it('warns when baseURL does not start with http', () => {
      const config: CodemindConfig = {
        anthropicApiKey: 'sk-test-key-12345678',
        baseURL: 'ftp://weird.example.com',
      }

      const result = validateCodemindConfig(config)
      expect(result.valid).toBe(true)
      expect(result.warnings.some((w) => w.includes('http'))).toBe(true)
    })

    it('includes model and maxTokens in redacted summary', () => {
      const config: CodemindConfig = {
        anthropicApiKey: 'sk-test-key-12345678',
        model: 'claude-sonnet-4-20250514',
        maxTokens: 4096,
        baseURL: 'https://api.anthropic.com',
      }

      const result = validateCodemindConfig(config)
      expect(result.redactedSummary.model).toBe('claude-sonnet-4-20250514')
      expect(result.redactedSummary.maxTokens).toBe(4096)
      expect(result.redactedSummary.baseURL).toBe('https://api.anthropic.com')
    })

    it('includes GitHub token status in redacted summary', () => {
      const config: CodemindConfig = {
        anthropicApiKey: 'sk-test-key-12345678',
        githubToken: 'ghp_test1234567890abcdef',
      }

      const result = validateCodemindConfig(config)
      expect(result.redactedSummary.hasGitHubToken).toBe(true)
      expect(result.redactedSummary.githubTokenPreview).toBeDefined()
      expect(result.redactedSummary.githubTokenPreview).not.toContain('ghp_test')
    })

    it('reports no GitHub token when absent', () => {
      const config: CodemindConfig = {
        anthropicApiKey: 'sk-test-key-12345678',
      }

      const result = validateCodemindConfig(config)
      expect(result.redactedSummary.hasGitHubToken).toBe(false)
      expect(result.redactedSummary.githubTokenPreview).toBeUndefined()
    })

    it('valid with only API key (everything else optional)', () => {
      const config: CodemindConfig = {
        anthropicApiKey: 'sk-minimal-key-1234',
      }

      const result = validateCodemindConfig(config)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    })
  })
})
