import { describe, expect, it } from 'vitest'

import { containsRepresentativeSandboxSecret, redactSandboxText } from './sandbox-redaction.js'

describe('Codetelligence access-key redaction', () => {
  it('redacts the canonical Codetelligence access key assignment', () => {
    const input = 'CODETELLIGENCE_API_KEY=canonical-secret-value'
    expect(redactSandboxText(input)).toBe('[REDACTED]')
    expect(containsRepresentativeSandboxSecret(input)).toBe(true)
  })

  it('continues to redact the legacy CodeMind access key assignment', () => {
    const input = 'CODEMIND_API_KEY=legacy-secret-value'
    expect(redactSandboxText(input)).toBe('[REDACTED]')
    expect(containsRepresentativeSandboxSecret(input)).toBe(true)
  })
})
