import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'

export const AGENT_TOKEN_PREFIX = 'sw_agent_'

const CREDENTIAL_ID_BYTES = 9
const SECRET_BYTES = 32
const SCRYPT_KEY_LENGTH = 64

export interface GeneratedAgentToken {
  /** The full bearer token — shown to the operator exactly once, never persisted in plaintext. */
  readonly token: string
  readonly credentialId: string
  readonly lastFour: string
}

function base64Url(input: Buffer): string {
  return input.toString('base64url')
}

/** `sw_agent_<credentialId>.<secret>` — the id half enables O(1) verifier lookup without a reversible index. */
export function generateAgentToken(): GeneratedAgentToken {
  const credentialId = base64Url(randomBytes(CREDENTIAL_ID_BYTES))
  const secret = base64Url(randomBytes(SECRET_BYTES))
  const token = `${AGENT_TOKEN_PREFIX}${credentialId}.${secret}`
  return { token, credentialId, lastFour: secret.slice(-4) }
}

export interface ParsedAgentToken {
  readonly credentialId: string
  readonly secret: string
}

export function parseAgentToken(presented: string): ParsedAgentToken | undefined {
  if (!presented.startsWith(AGENT_TOKEN_PREFIX)) return undefined
  const rest = presented.slice(AGENT_TOKEN_PREFIX.length)
  const separatorIndex = rest.indexOf('.')
  if (separatorIndex <= 0 || separatorIndex === rest.length - 1) return undefined
  return {
    credentialId: rest.slice(0, separatorIndex),
    secret: rest.slice(separatorIndex + 1),
  }
}

export interface SecretHash {
  readonly saltHex: string
  readonly hashHex: string
}

export function hashSecret(secret: string): SecretHash {
  const salt = randomBytes(16)
  const hash = scryptSync(secret, salt, SCRYPT_KEY_LENGTH)
  return { saltHex: salt.toString('hex'), hashHex: hash.toString('hex') }
}

/** Constant-time verification against a stored scrypt hash. */
export function verifySecret(secret: string, stored: SecretHash): boolean {
  const salt = Buffer.from(stored.saltHex, 'hex')
  const expected = Buffer.from(stored.hashHex, 'hex')
  const actual = scryptSync(secret, salt, expected.length)
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`
}

export function generateDeviceCode(): string {
  return base64Url(randomBytes(24))
}

/** A short, human-typeable code shown to the operator to correlate a pending device request (e.g. `WXYZ-QRST`). */
export function generateUserCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i++) {
    out += alphabet[(bytes[i] as number) % alphabet.length]
    if (i === 3) out += '-'
  }
  return out
}
