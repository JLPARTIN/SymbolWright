const SECRET_PATTERNS = [
  /ghp_[A-Za-z0-9]{36}/g,
  /gho_[A-Za-z0-9]{36}/g,
  /github_pat_[A-Za-z0-9_]{82}/g,
  /sk-[A-Za-z0-9]{48}/g,
  /(?:api[_-]?key|secret|token|password|credential)\s*[:=]\s*\S+/gi,
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
  /Bearer\s+[A-Za-z0-9._-]{20,}/g,
]

const ENV_LEAK_PATTERNS = [
  /(?:^|\n)\s*(?:HOME|USER|LOGNAME|HOSTNAME)\s*=\s*\S+/g,
  /\/home\/[^\s/]+/g,
  /\/Users\/[^\s/]+/g,
]

export function redactValidationOutput(output: string): string {
  let redacted = output
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]')
  }
  for (const pattern of ENV_LEAK_PATTERNS) {
    redacted = redacted.replace(pattern, '[PATH_REDACTED]')
  }
  return redacted
}
