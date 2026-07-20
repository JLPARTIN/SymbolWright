import { createHash } from 'node:crypto'

const REDACTED = '[REDACTED]'
const MAX_STRING_CHARS = 8_192
const MAX_ARRAY_ENTRIES = 200
const MAX_OBJECT_KEYS = 200

const SECRET_KEY_PATTERN =
  /(?:authorization|proxy-authorization|cookie|set-cookie|api[_-]?key|access[_-]?key|secret|password|passwd|token|private[_-]?key|client[_-]?secret|codemind_api_key|github_token)/i

const SECRET_ENV_NAME_PATTERN =
  /(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|AUTH|COOKIE|CREDENTIAL|PRIVATE)/i

const SECRET_TEXT_PATTERNS: readonly RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
]

const SECRET_QUERY_PARAMETER_PATTERN =
  /([?&](?:api[_-]?key|access[_-]?token|token|secret|authorization|auth|key)=)[^&#\s]*/gi

function collectSecretEnvironmentValues(env: NodeJS.ProcessEnv): readonly string[] {
  return Object.entries(env)
    .filter(([name, value]) => SECRET_ENV_NAME_PATTERN.test(name) && typeof value === 'string')
    .map(([, value]) => value?.trim() ?? '')
    .filter((value) => value.length >= 6)
    .sort((a, b) => b.length - a.length)
}

export function redactMissionText(
  input: string,
  env: NodeJS.ProcessEnv = process.env,
  maxChars = MAX_STRING_CHARS,
): string {
  let output = input

  for (const pattern of SECRET_TEXT_PATTERNS) {
    output = output.replace(pattern, REDACTED)
  }

  output = output.replace(SECRET_QUERY_PARAMETER_PATTERN, `$1${REDACTED}`)

  for (const secretValue of collectSecretEnvironmentValues(env)) {
    output = output.replaceAll(secretValue, REDACTED)
  }

  if (output.length > maxChars) {
    output = `${output.slice(0, maxChars)}\n[TRUNCATED ${output.length - maxChars} CHARACTERS]`
  }

  return output
}

function redactInternal(
  value: unknown,
  env: NodeJS.ProcessEnv,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (depth > 12) return '[MAX_DEPTH]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return redactMissionText(value, env)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'function' || typeof value === 'symbol') return undefined

  if (Array.isArray(value)) {
    const limited = value.slice(0, MAX_ARRAY_ENTRIES)
    const redacted = limited.map((entry) => redactInternal(entry, env, seen, depth + 1))
    if (value.length > limited.length) redacted.push(`[TRUNCATED ${value.length - limited.length} ENTRIES]`)
    return redacted
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '[CIRCULAR]'
    seen.add(value)

    const output: Record<string, unknown> = {}
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS)
    for (const [key, entry] of entries) {
      if (SECRET_KEY_PATTERN.test(key)) {
        output[key] = REDACTED
      } else {
        const redacted = redactInternal(entry, env, seen, depth + 1)
        if (redacted !== undefined) output[key] = redacted
      }
    }

    const totalKeys = Object.keys(value as Record<string, unknown>).length
    if (totalKeys > entries.length) output['_truncatedKeys'] = totalKeys - entries.length
    return output
  }

  return String(value)
}

export function redactMissionValue(
  value: unknown,
  env: NodeJS.ProcessEnv = process.env,
): unknown {
  return redactInternal(value, env, new WeakSet<object>(), 0)
}

export function redactMissionRecord<T>(value: T, env: NodeJS.ProcessEnv = process.env): T {
  return redactMissionValue(value, env) as T
}

export function sanitizeMissionPayload(
  payload: unknown,
  env: NodeJS.ProcessEnv = process.env,
  maxJsonBytes = 16 * 1024,
): Record<string, unknown> | undefined {
  const redacted = redactMissionValue(payload, env)
  if (typeof redacted !== 'object' || redacted === null || Array.isArray(redacted)) {
    return redacted === undefined ? undefined : { value: redacted }
  }

  const record = redacted as Record<string, unknown>
  const serialized = JSON.stringify(record)
  if (Buffer.byteLength(serialized, 'utf8') <= maxJsonBytes) return record

  return {
    summary: redactMissionText(serialized, env, Math.max(512, maxJsonBytes - 256)),
    truncated: true,
    originalSha256: sha256Text(serialized),
  }
}

export function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function containsRepresentativeSecret(value: unknown): boolean {
  const serialized = JSON.stringify(value)
  return (
    /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/i.test(serialized) ||
    /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/.test(serialized) ||
    /\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}\b/.test(serialized) ||
    /BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY/.test(serialized)
  )
}
