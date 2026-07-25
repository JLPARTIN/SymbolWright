// Shared helpers for scripts/codespaces-start.mjs, codespaces-stop.mjs, and
// codespaces-status.mjs: runtime file locations, safe stale-process
// detection, Codespaces URL resolution, access-key generation, and
// provider-key detection that never logs a secret value.
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_PORT = 8787
export const DEFAULT_HOST = '127.0.0.1'
export const HEALTH_TIMEOUT_MS = 45_000
export const HEALTH_POLL_INTERVAL_MS = 500

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = join(SCRIPT_DIR, '..', '..')
export const RUNTIME_DIR = join(REPO_ROOT, '.symbolwright', 'runtime')
export const PID_FILE = join(RUNTIME_DIR, 'codespaces-server.pid')
export const LOG_FILE = join(RUNTIME_DIR, 'codespaces-server.log')
export const API_KEY_FILE = join(RUNTIME_DIR, 'codespaces-api-key')

/** Provider env vars SymbolWright reads (mirrors src/providers/provider-config.ts). Never log the values. */
export const PROVIDER_ENV_VARS = [
  { providerId: 'anthropic', displayName: 'Anthropic', envVar: 'ANTHROPIC_API_KEY' },
  { providerId: 'openai', displayName: 'OpenAI', envVar: 'OPENAI_API_KEY' },
  { providerId: 'google-gemini', displayName: 'Google', envVar: 'GOOGLE_API_KEY' },
  { providerId: 'groq', displayName: 'Groq', envVar: 'GROQ_API_KEY' },
  { providerId: 'openrouter', displayName: 'OpenRouter', envVar: 'OPENROUTER_API_KEY' },
  { providerId: 'github-models', displayName: 'GitHub Models', envVar: 'GITHUB_TOKEN' },
  { providerId: 'deepseek', displayName: 'DeepSeek', envVar: 'DEEPSEEK_API_KEY' },
  { providerId: 'custom', displayName: 'Custom OpenAI-compatible', envVar: 'SYMBOLWRIGHT_OPENAI_COMPATIBLE_API_KEY' },
]

export function ensureRuntimeDir() {
  mkdirSync(RUNTIME_DIR, { recursive: true })
}

/** chmod 600 where supported; a no-op (not a failure) on platforms without POSIX permission bits. */
export function chmodSecret(path) {
  try {
    chmodSync(path, 0o600)
  } catch {
    // Best-effort; not fatal (e.g. unsupported on the current filesystem).
  }
}

export function generateApiKey() {
  return randomBytes(24).toString('hex')
}

/** Reuses a previously generated key for this Codespace session, or mints and persists a new one. */
export function loadOrCreateApiKey() {
  if (existsSync(API_KEY_FILE)) {
    const existing = readFileSync(API_KEY_FILE, 'utf8').trim()
    if (existing.length > 0) {
      return { apiKey: existing, source: 'persisted' }
    }
  }

  const apiKey = generateApiKey()
  ensureRuntimeDir()
  writeFileSync(API_KEY_FILE, `${apiKey}\n`, 'utf8')
  chmodSecret(API_KEY_FILE)
  return { apiKey, source: 'generated' }
}

/** Detects the real Codespaces forwarded URL; falls back to loopback, never a placeholder. */
export function resolveOpenUrl(port, env = process.env) {
  const codespaceName = env.CODESPACE_NAME
  const forwardingDomain = env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
  if (typeof codespaceName === 'string' && codespaceName.trim().length > 0 &&
      typeof forwardingDomain === 'string' && forwardingDomain.trim().length > 0) {
    return `https://${codespaceName}-${port}.${forwardingDomain}`
  }
  return `http://127.0.0.1:${port}`
}

/** Providers whose API key env var is set, without ever returning the value. */
export function detectProviders(env = process.env) {
  return PROVIDER_ENV_VARS.map(({ providerId, displayName, envVar }) => ({
    providerId,
    displayName,
    envVar,
    detected: typeof env[envVar] === 'string' && env[envVar].trim().length > 0,
  }))
}

export function readPidRecord() {
  if (!existsSync(PID_FILE)) {
    return undefined
  }
  try {
    const raw = readFileSync(PID_FILE, 'utf8').trim()
    if (raw.length === 0) return undefined
    const record = JSON.parse(raw)
    if (typeof record.pid !== 'number' || typeof record.marker !== 'string') {
      return undefined
    }
    return record
  } catch {
    return undefined
  }
}

export function writePidRecord(record) {
  ensureRuntimeDir()
  writeFileSync(PID_FILE, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
  chmodSecret(PID_FILE)
}

export function removePidFile() {
  try {
    rmSync(PID_FILE, { force: true })
  } catch {
    // Not fatal.
  }
}

export function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Confirms a PID is actually the SymbolWright Codespaces server this repo
 * started, not an unrelated process that happens to reuse the PID (e.g.
 * after a reboot). Reads /proc/<pid>/environ for the unique marker this
 * script set when it launched the process -- never signals a PID on trust
 * alone, so an unrelated `node` process is never killed.
 */
export function isTrackedSymbolWrightProcess(pid, marker) {
  try {
    const environPath = `/proc/${pid}/environ`
    if (!existsSync(environPath)) {
      return false
    }
    const environ = readFileSync(environPath, 'utf8')
    return environ.split('\0').includes(`SYMBOLWRIGHT_CODESPACES_MARKER=${marker}`)
  } catch {
    return false
  }
}

/** Best-effort discovery of foreign (untracked) PIDs listening on a port, for diagnostics only -- never killed automatically. */
export function findPidsListeningOnPort(port) {
  const attempts = [
    { cmd: 'lsof', args: ['-ti', `:${port}`] },
    { cmd: 'fuser', args: [`${port}/tcp`] },
  ]

  for (const attempt of attempts) {
    const result = spawnSync(attempt.cmd, attempt.args, { encoding: 'utf8' })
    if (result.error || result.status !== 0) continue
    const pids = result.stdout
      .split(/\s+/)
      .map((token) => Number.parseInt(token, 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0)
    if (pids.length > 0) return [...new Set(pids)]
  }

  return []
}

export async function isPortListening(port, host = DEFAULT_HOST) {
  try {
    const response = await fetch(`http://${host}:${port}/api/health`, {
      signal: AbortSignal.timeout(1_000),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function waitForHealth(url, timeoutMs = HEALTH_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2_000) })
      if (response.ok) {
        return { healthy: true }
      }
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_INTERVAL_MS))
  }
  return { healthy: false, error: lastError }
}

export function tailLines(text, count) {
  const lines = text.split('\n')
  return lines.slice(Math.max(0, lines.length - count)).join('\n')
}

export function readLogTail(count = 60) {
  if (!existsSync(LOG_FILE)) {
    return '(no log file yet)'
  }
  try {
    return tailLines(readFileSync(LOG_FILE, 'utf8'), count)
  } catch (error) {
    return `(failed to read log: ${error instanceof Error ? error.message : String(error)})`
  }
}

export function currentGitInfo() {
  const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' })
  const commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' })
  return {
    branch: branch.status === 0 ? branch.stdout.trim() : 'unknown',
    commit: commit.status === 0 ? commit.stdout.trim() : 'unknown',
  }
}
