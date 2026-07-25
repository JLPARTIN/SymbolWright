import { generateKeyPairSync, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  GitHubAppConfigError,
  loadGitHubAppConfigFromEnv,
  signGitHubAppJwt,
} from './github-app-auth.js'

function generateTestKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  }
}

function decodeJwtPart(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>
}

describe('loadGitHubAppConfigFromEnv', () => {
  it('returns undefined when GITHUB_APP_ID is not set', () => {
    expect(loadGitHubAppConfigFromEnv({})).toBeUndefined()
  })

  it('reads an inline private key, decoding escaped newlines', () => {
    const { privateKeyPem } = generateTestKeyPair()
    const escaped = privateKeyPem.replaceAll('\n', '\\n')
    const config = loadGitHubAppConfigFromEnv({
      GITHUB_APP_ID: '12345',
      GITHUB_APP_PRIVATE_KEY: escaped,
    })
    expect(config?.appId).toBe('12345')
    expect(config?.privateKeyPem).toContain('BEGIN')
    expect(config?.privateKeyPem).toContain('\n')
  })

  it('reads the private key from a file when only a path is given', () => {
    const { privateKeyPem } = generateTestKeyPair()
    const config = loadGitHubAppConfigFromEnv(
      { GITHUB_APP_ID: '12345', GITHUB_APP_PRIVATE_KEY_PATH: '/fake/path.pem' },
      () => privateKeyPem,
    )
    expect(config?.privateKeyPem).toBe(privateKeyPem)
  })

  it('throws when the App ID is set but no private key is provided', () => {
    expect(() => loadGitHubAppConfigFromEnv({ GITHUB_APP_ID: '12345' })).toThrow(
      GitHubAppConfigError,
    )
  })

  it('throws when the provided value does not look like a PEM private key', () => {
    expect(() =>
      loadGitHubAppConfigFromEnv({ GITHUB_APP_ID: '12345', GITHUB_APP_PRIVATE_KEY: 'not-a-key' }),
    ).toThrow(GitHubAppConfigError)
  })
})

describe('signGitHubAppJwt', () => {
  it('produces a JWT with the App ID as issuer and a bounded iat/exp window', () => {
    const { privateKeyPem } = generateTestKeyPair()
    const fixedNow = new Date('2026-01-01T00:00:00Z')
    const jwt = signGitHubAppJwt({ appId: '99', privateKeyPem }, () => fixedNow)
    const [headerPart, payloadPart] = jwt.split('.')
    const header = decodeJwtPart(headerPart as string)
    const payload = decodeJwtPart(payloadPart as string)

    expect(header['alg']).toBe('RS256')
    expect(payload['iss']).toBe('99')
    const nowSeconds = Math.floor(fixedNow.getTime() / 1000)
    expect(payload['iat']).toBe(nowSeconds - 60)
    expect(payload['exp']).toBeLessThanOrEqual(nowSeconds + 600)
    expect(payload['exp']).toBeGreaterThan(nowSeconds)
  })

  it('produces a signature that verifies against the matching public key', () => {
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair()
    const jwt = signGitHubAppJwt({ appId: '1', privateKeyPem })
    const [headerPart, payloadPart, signaturePart] = jwt.split('.')
    const signingInput = `${headerPart}.${payloadPart}`
    const signature = Buffer.from(signaturePart as string, 'base64url')

    const isValid = verify('RSA-SHA256', Buffer.from(signingInput), publicKeyPem, signature)
    expect(isValid).toBe(true)
  })

  it('produces a different signature for a tampered payload (integrity check)', () => {
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair()
    const jwt = signGitHubAppJwt({ appId: '1', privateKeyPem })
    const [headerPart, , signaturePart] = jwt.split('.')
    const tamperedPayload = Buffer.from(
      JSON.stringify({ iss: '2', iat: 0, exp: 999999999 }),
    ).toString('base64url')
    const tamperedSigningInput = `${headerPart}.${tamperedPayload}`
    const signature = Buffer.from(signaturePart as string, 'base64url')

    const isValid = verify('RSA-SHA256', Buffer.from(tamperedSigningInput), publicKeyPem, signature)
    expect(isValid).toBe(false)
  })
})
