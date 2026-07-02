const SECRET_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9_]{8,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{8,}\b/g,
  /\b[A-Za-z0-9._%+-]+:[A-Za-z0-9._%+-]{12,}@/g,
]

const KEY_VALUE_SECRET_PATTERN =
  /\b(api[_-]?key|token|secret|password|authorization)\b\s*[:=]\s*["']?[^"'\s,}]+/gi

export function redactMcpText(text: string, knownSecrets: readonly string[] = []): string {
  let redacted = text

  for (const secret of knownSecrets) {
    if (secret.trim().length >= 4) {
      redacted = redacted.split(secret).join('<redacted>')
    }
  }

  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, '<redacted>')
  }

  return redacted.replace(KEY_VALUE_SECRET_PATTERN, (_match, key: string) => `${key}=<redacted>`)
}

export function redactMcpJson(value: unknown, knownSecrets: readonly string[] = []): string {
  return JSON.stringify(
    value,
    (_key, item: unknown) => {
      if (typeof item === 'string') {
        return redactMcpText(item, knownSecrets)
      }
      return item
    },
    2,
  )
}
