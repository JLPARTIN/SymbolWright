import { describe, expect, it } from 'vitest'

import {
  AGENT_TOKEN_PREFIX,
  generateAgentToken,
  hashSecret,
  parseAgentToken,
  verifySecret,
} from './access-credential.js'

describe('agent token generation and verification', () => {
  it('generates a token with the recognizable sw_agent_ prefix', () => {
    const generated = generateAgentToken()
    expect(generated.token.startsWith(AGENT_TOKEN_PREFIX)).toBe(true)
    expect(generated.token).toContain('.')
  })

  it('round-trips through parseAgentToken', () => {
    const generated = generateAgentToken()
    const parsed = parseAgentToken(generated.token)
    expect(parsed).toBeDefined()
    expect(parsed?.credentialId).toBe(generated.credentialId)
  })

  it('rejects malformed tokens', () => {
    expect(parseAgentToken('not-a-token')).toBeUndefined()
    expect(parseAgentToken('sw_agent_missing-separator')).toBeUndefined()
    expect(parseAgentToken('sw_agent_id.')).toBeUndefined()
  })

  it('verifies a correct secret against its stored hash and rejects an incorrect one', () => {
    const stored = hashSecret('correct-secret-value')
    expect(verifySecret('correct-secret-value', stored)).toBe(true)
    expect(verifySecret('wrong-secret-value', stored)).toBe(false)
  })

  it('never stores the plaintext secret', () => {
    const stored = hashSecret('super-secret-token-value')
    expect(JSON.stringify(stored)).not.toContain('super-secret-token-value')
  })

  it('produces different salts (and thus different hashes) for the same secret', () => {
    const a = hashSecret('same-secret')
    const b = hashSecret('same-secret')
    expect(a.saltHex).not.toBe(b.saltHex)
    expect(a.hashHex).not.toBe(b.hashHex)
  })
})
