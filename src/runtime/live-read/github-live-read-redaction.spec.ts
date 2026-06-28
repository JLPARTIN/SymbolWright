import { describe, expect, it } from 'vitest'

import { redactGitHubContent, redactUnknownBody } from './github-live-read-redaction.js'

describe('redactGitHubContent', () => {
  it('redacts GitHub personal access tokens (ghp_)', () => {
    const input = 'token: ghp_abcdefghijklmnopqrstuvwxyz0123456789'
    expect(redactGitHubContent(input)).toContain('[REDACTED]')
    expect(redactGitHubContent(input)).not.toContain('ghp_')
  })

  it('redacts GitHub OAuth tokens (gho_)', () => {
    const input = 'auth: gho_abcdefghijklmnopqrstuvwxyz0123456789'
    expect(redactGitHubContent(input)).toContain('[REDACTED]')
    expect(redactGitHubContent(input)).not.toContain('gho_')
  })

  it('redacts fine-grained personal access tokens (github_pat_)', () => {
    const pat = 'github_pat_' + 'A'.repeat(82)
    const input = `token: ${pat}`
    expect(redactGitHubContent(input)).toContain('[REDACTED]')
    expect(redactGitHubContent(input)).not.toContain('github_pat_')
  })

  it('redacts Anthropic-style API keys (sk-)', () => {
    const key = 'sk-' + 'a'.repeat(48)
    const input = `api_key: ${key}`
    expect(redactGitHubContent(input)).toContain('[REDACTED]')
    expect(redactGitHubContent(input)).not.toContain(key)
  })

  it('redacts Bearer tokens', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test'
    expect(redactGitHubContent(input)).toContain('[REDACTED]')
    expect(redactGitHubContent(input)).not.toContain('eyJhbGci')
  })

  it('redacts private key headers', () => {
    const input = 'key: -----BEGIN RSA PRIVATE KEY-----'
    expect(redactGitHubContent(input)).toContain('[REDACTED]')
    expect(redactGitHubContent(input)).not.toContain('PRIVATE KEY')
  })

  it('redacts BEGIN PRIVATE KEY (non-RSA)', () => {
    const input = '-----BEGIN PRIVATE KEY-----'
    expect(redactGitHubContent(input)).toContain('[REDACTED]')
  })

  it('leaves safe content unchanged', () => {
    const input = 'This is a normal PR description with no secrets.'
    expect(redactGitHubContent(input)).toBe(input)
  })

  it('redacts multiple tokens in one string', () => {
    const input =
      'token1: ghp_abcdefghijklmnopqrstuvwxyz0123456789 and token2: gho_abcdefghijklmnopqrstuvwxyz0123456789'
    const result = redactGitHubContent(input)
    expect(result).not.toContain('ghp_')
    expect(result).not.toContain('gho_')
    expect(result.match(/\[REDACTED\]/g)?.length).toBe(2)
  })
})

describe('redactUnknownBody', () => {
  it('redacts strings', () => {
    const input = 'token: ghp_abcdefghijklmnopqrstuvwxyz0123456789'
    expect(redactUnknownBody(input)).toContain('[REDACTED]')
  })

  it('recursively redacts arrays', () => {
    const input = ['safe text', 'secret: ghp_abcdefghijklmnopqrstuvwxyz0123456789']
    const result = redactUnknownBody(input) as string[]
    expect(result[0]).toBe('safe text')
    expect(result[1]).toContain('[REDACTED]')
    expect(result[1]).not.toContain('ghp_')
  })

  it('recursively redacts object values', () => {
    const input = {
      title: 'PR title',
      body: 'Contains ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    }
    const result = redactUnknownBody(input) as Record<string, string>
    expect(result['title']).toBe('PR title')
    expect(result['body']).toContain('[REDACTED]')
  })

  it('handles nested objects', () => {
    const input = {
      outer: {
        inner: {
          secret: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload',
        },
      },
    }
    const result = redactUnknownBody(input) as Record<
      string,
      Record<string, Record<string, string>>
    >
    expect(result['outer']!['inner']!['secret']).toContain('[REDACTED]')
  })

  it('handles arrays inside objects', () => {
    const input = {
      tokens: ['ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'safe-value'],
    }
    const result = redactUnknownBody(input) as Record<string, string[]>
    expect(result['tokens']![0]).toContain('[REDACTED]')
    expect(result['tokens']![1]).toBe('safe-value')
  })

  it('passes through numbers unchanged', () => {
    expect(redactUnknownBody(42)).toBe(42)
  })

  it('passes through booleans unchanged', () => {
    expect(redactUnknownBody(true)).toBe(true)
  })

  it('passes through null unchanged', () => {
    expect(redactUnknownBody(null)).toBe(null)
  })

  it('passes through undefined unchanged', () => {
    expect(redactUnknownBody(undefined)).toBe(undefined)
  })

  it('handles empty objects', () => {
    expect(redactUnknownBody({})).toEqual({})
  })

  it('handles empty arrays', () => {
    expect(redactUnknownBody([])).toEqual([])
  })

  it('handles mixed nested structures', () => {
    const input = {
      count: 3,
      active: true,
      items: [{ name: 'safe', key: 'sk-' + 'x'.repeat(48) }, null, 'normal string'],
    }
    const result = redactUnknownBody(input) as Record<string, unknown>
    expect(result['count']).toBe(3)
    expect(result['active']).toBe(true)
    const items = result['items'] as unknown[]
    const first = items[0] as Record<string, string>
    expect(first['name']).toBe('safe')
    expect(first['key']).toContain('[REDACTED]')
    expect(items[1]).toBe(null)
    expect(items[2]).toBe('normal string')
  })
})
