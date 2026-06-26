const TOKEN_PATTERNS = [
  /ghp_[A-Za-z0-9]{36}/g,
  /gho_[A-Za-z0-9]{36}/g,
  /github_pat_[A-Za-z0-9_]{82}/g,
  /sk-[A-Za-z0-9]{48}/g,
  /Bearer\s+[A-Za-z0-9._-]{20,}/g,
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
]

export function redactGitHubContent(content: string): string {
  let redacted = content
  for (const pattern of TOKEN_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]')
  }
  return redacted
}

export function redactUnknownBody(body: unknown): unknown {
  if (typeof body === 'string') {
    return redactGitHubContent(body)
  }
  if (Array.isArray(body)) {
    return body.map(redactUnknownBody)
  }
  if (typeof body === 'object' && body !== null) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(body)) {
      result[key] = redactUnknownBody(value)
    }
    return result
  }
  return body
}
