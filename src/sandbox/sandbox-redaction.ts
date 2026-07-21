import { createHash } from 'node:crypto'

const SECRET_PATTERNS: readonly RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /gh[pousr]_[A-Za-z0-9_]{20,}/g,
  /sk-[A-Za-z0-9_-]{16,}/g,
  /AIza[A-Za-z0-9_-]{16,}/g,
  /CODEMIND_API_KEY\s*=\s*[^\s]+/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /(authorization|cookie|api[_-]?key|token|secret|password)=([^\s&]+)/gi,
]

export function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function redactSandboxText(value: string, maxBytes = 64_000): string {
  let redacted = value
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]')
  }

  const encoded = new TextEncoder().encode(redacted)
  if (encoded.byteLength <= maxBytes) return redacted
  return `${new TextDecoder().decode(encoded.slice(0, maxBytes))}\n[TRUNCATED]`
}

export function excerptSandboxOutput(stdout: string, stderr: string, maxBytes = 4_000): string {
  const joined = [stdout, stderr].filter((part) => part.length > 0).join('\n--- stderr ---\n')
  return redactSandboxText(joined, maxBytes)
}

export function containsRepresentativeSandboxSecret(value: unknown): boolean {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) return false
  return SECRET_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0
    return pattern.test(serialized)
  })
}
