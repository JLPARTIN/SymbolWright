import { describe, expect, it } from 'vitest'

import { redactValidationOutput } from './validation-output-redactor.js'

describe('redactValidationOutput', () => {
  it('redacts GitHub PAT (ghp_)', () => {
    // secretlint-disable-next-line
    const input = 'token: ghp_ABCDEFghijklmnopqrstuvwxyz0123456789'
    expect(redactValidationOutput(input)).toContain('[REDACTED]')
    expect(redactValidationOutput(input)).not.toContain('ghp_')
  })

  it('redacts GitHub OAuth (gho_)', () => {
    // secretlint-disable-next-line
    const input = 'auth: gho_ABCDEFghijklmnopqrstuvwxyz0123456789'
    expect(redactValidationOutput(input)).toContain('[REDACTED]')
    expect(redactValidationOutput(input)).not.toContain('gho_')
  })

  it('redacts GitHub fine-grained (github_pat_)', () => {
    const pat = 'github_pat_' + 'A'.repeat(82)
    expect(redactValidationOutput(pat)).toContain('[REDACTED]')
    expect(redactValidationOutput(pat)).not.toContain('github_pat_')
  })

  it('redacts OpenAI key (sk-)', () => {
    const key = 'sk-' + 'a'.repeat(48)
    expect(redactValidationOutput(key)).toContain('[REDACTED]')
    expect(redactValidationOutput(key)).not.toContain('sk-')
  })

  it('redacts api_key pattern', () => {
    const input = 'api_key: mysecretvalue123'
    expect(redactValidationOutput(input)).toContain('[REDACTED]')
  })

  it('redacts Bearer token', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test'
    expect(redactValidationOutput(input)).toContain('[REDACTED]')
    expect(redactValidationOutput(input)).not.toContain('eyJhbGci')
  })

  it('redacts PEM private key header', () => {
    const input = '-----BEGIN PRIVATE KEY-----\nbase64data\n-----END PRIVATE KEY-----'
    expect(redactValidationOutput(input)).toContain('[REDACTED]')
  })

  it('redacts RSA private key header', () => {
    const input = '-----BEGIN RSA PRIVATE KEY-----\ndata'
    expect(redactValidationOutput(input)).toContain('[REDACTED]')
  })

  it('redacts HOME env leak', () => {
    const input = 'HOME=/home/developer'
    expect(redactValidationOutput(input)).toContain('[PATH_REDACTED]')
  })

  it('redacts /home/user paths', () => {
    const input = 'Found file at /home/developer/project/src/main.ts'
    expect(redactValidationOutput(input)).toContain('[PATH_REDACTED]')
    expect(redactValidationOutput(input)).not.toContain('/home/developer')
  })

  it('redacts /Users/ paths', () => {
    const input = 'Path: /Users/devuser/code'
    expect(redactValidationOutput(input)).toContain('[PATH_REDACTED]')
  })

  it('passes clean text through unchanged', () => {
    const clean = 'This is a normal log message with no secrets'
    expect(redactValidationOutput(clean)).toBe(clean)
  })
})
