import { spawnSync as nodeSpawnSync } from 'node:child_process'

import { redactSandboxText } from './sandbox-redaction.js'
import type { SandboxRunnerAvailability } from './sandbox-types.js'

const DEFAULT_DISCOVERY_TIMEOUT_MS = 750
const MAX_DISCOVERY_OUTPUT_CHARS = 2_000

export interface SandboxDiscoveryProbe {
  readonly id: string
  readonly command: string
  readonly args: readonly string[]
  readonly versionPattern?: RegExp
}

export interface SandboxDiscoveryOptions {
  readonly timeoutMs?: number
  readonly env?: NodeJS.ProcessEnv
  readonly now?: () => Date
  readonly spawnSync?: SandboxSpawnSync
}

export interface SandboxSpawnSyncOptions {
  readonly timeout: number
  readonly shell: false
  readonly windowsHide: true
  readonly encoding: 'utf8'
  readonly env: NodeJS.ProcessEnv
}

export interface SandboxSpawnSyncResult {
  readonly status: number | null
  readonly signal?: NodeJS.Signals | string | null
  readonly stdout?: string | Buffer | null
  readonly stderr?: string | Buffer | null
  readonly error?: {
    readonly code?: string
    readonly message?: string
  } | null
}

export type SandboxSpawnSync = (
  command: string,
  args: readonly string[],
  options: SandboxSpawnSyncOptions,
) => SandboxSpawnSyncResult

export const DEFAULT_SANDBOX_DISCOVERY_PROBES: readonly SandboxDiscoveryProbe[] = [
  { id: 'node', command: 'node', args: ['--version'], versionPattern: /v?([0-9][^\s]*)/ },
  { id: 'python3', command: 'python3', args: ['--version'], versionPattern: /Python\s+([^\s]+)/ },
  { id: 'go', command: 'go', args: ['version'], versionPattern: /go version\s+go([^\s]+)/ },
  { id: 'rustc', command: 'rustc', args: ['--version'], versionPattern: /rustc\s+([^\s]+)/ },
  { id: 'cargo', command: 'cargo', args: ['--version'], versionPattern: /cargo\s+([^\s]+)/ },
  { id: 'javac', command: 'javac', args: ['-version'], versionPattern: /javac\s+([^\s]+)/ },
  { id: 'java', command: 'java', args: ['-version'], versionPattern: /version\s+"?([^"\s]+)/ },
  { id: 'ruby', command: 'ruby', args: ['--version'], versionPattern: /ruby\s+([^\s]+)/ },
  { id: 'php', command: 'php', args: ['--version'], versionPattern: /PHP\s+([^\s]+)/ },
  { id: 'gcc', command: 'gcc', args: ['--version'], versionPattern: /gcc[^\n]*\s([0-9][^\s]*)/i },
  { id: 'g++', command: 'g++', args: ['--version'], versionPattern: /g\+\+[^\n]*\s([0-9][^\s]*)/i },
  { id: 'Rscript', command: 'Rscript', args: ['--version'], versionPattern: /Rscript\s+([^\s]+)/ },
  {
    id: 'docker',
    command: 'docker',
    args: ['--version'],
    versionPattern: /Docker version\s+([^,\s]+)/,
  },
  {
    id: 'podman',
    command: 'podman',
    args: ['--version'],
    versionPattern: /podman version\s+([^\s]+)/i,
  },
]

function safeDiscoveryEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const safeEnv: NodeJS.ProcessEnv = {}
  const pathValue = env['PATH']
  if (pathValue !== undefined) safeEnv['PATH'] = pathValue
  const systemRoot = env['SystemRoot']
  if (systemRoot !== undefined) safeEnv['SystemRoot'] = systemRoot
  const windir = env['WINDIR']
  if (windir !== undefined) safeEnv['WINDIR'] = windir
  return safeEnv
}

function defaultSpawnSync(
  command: string,
  args: readonly string[],
  options: SandboxSpawnSyncOptions,
): SandboxSpawnSyncResult {
  const result = nodeSpawnSync(command, [...args], options)
  return {
    status: result.status,
    ...(result.signal === null ? {} : { signal: result.signal }),
    stdout: result.stdout,
    stderr: result.stderr,
    ...(result.error === undefined ? {} : { error: result.error }),
  }
}

function availability(
  status: SandboxRunnerAvailability['status'],
  checkedAt: string,
  details: { readonly version?: string; readonly reason?: string } = {},
): SandboxRunnerAvailability {
  return {
    status,
    checkedAt,
    ...(details.version === undefined ? {} : { version: details.version }),
    ...(details.reason === undefined ? {} : { reason: details.reason }),
  }
}

function outputText(value: string | Buffer | null | undefined): string {
  if (value === null || value === undefined) return ''
  return Buffer.isBuffer(value) ? value.toString('utf8') : value
}

function cleanDiscoveryText(stdout: string, stderr: string): string {
  return redactSandboxText(`${stdout}\n${stderr}`.trim(), MAX_DISCOVERY_OUTPUT_CHARS)
}

function extractVersion(probe: SandboxDiscoveryProbe, output: string): string | undefined {
  const match = probe.versionPattern?.exec(output)
  if (match?.[1] !== undefined) return match[1]
  const firstLine = output
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0)
    ?.trim()
  return firstLine === undefined || firstLine.length === 0 ? undefined : firstLine.slice(0, 120)
}

function probeRuntimeCommand(
  probe: SandboxDiscoveryProbe,
  options: Required<Pick<SandboxDiscoveryOptions, 'now' | 'spawnSync'>> & {
    readonly timeoutMs: number
    readonly env: NodeJS.ProcessEnv
  },
): SandboxRunnerAvailability {
  const checkedAt = options.now().toISOString()
  let result: SandboxSpawnSyncResult
  try {
    result = options.spawnSync(probe.command, probe.args, {
      timeout: options.timeoutMs,
      shell: false,
      windowsHide: true,
      encoding: 'utf8',
      env: safeDiscoveryEnv(options.env),
    })
  } catch (error) {
    return availability('unavailable', checkedAt, {
      reason: `${probe.command} probe could not start: ${
        error instanceof Error ? error.message : String(error)
      }`,
    })
  }

  const stdout = outputText(result.stdout)
  const stderr = outputText(result.stderr)
  const output = cleanDiscoveryText(stdout, stderr)
  const code = result.error?.code

  if (code === 'ENOENT') {
    return availability('unavailable', checkedAt, {
      reason: `${probe.command} was not found on PATH.`,
    })
  }

  if (code === 'ETIMEDOUT' || result.signal === 'SIGTERM' || result.signal === 'SIGKILL') {
    return availability('misconfigured', checkedAt, {
      reason: `${probe.command} discovery timed out after ${options.timeoutMs}ms.`,
    })
  }

  if (result.error !== undefined && result.error !== null) {
    return availability('misconfigured', checkedAt, {
      reason: `${probe.command} probe failed: ${result.error.message ?? String(result.error)}`,
    })
  }

  if (result.status !== 0) {
    return availability('misconfigured', checkedAt, {
      reason: `${probe.command} exited with status ${result.status ?? 'unknown'} during discovery${
        output.length === 0 ? '' : `: ${output}`
      }`,
    })
  }

  const version = extractVersion(probe, output)
  return availability('available', checkedAt, {
    ...(version === undefined ? {} : { version }),
  })
}

export async function discoverRuntimeCommand(
  probe: SandboxDiscoveryProbe,
  options: SandboxDiscoveryOptions = {},
): Promise<SandboxRunnerAvailability> {
  return probeRuntimeCommand(probe, {
    now: options.now ?? (() => new Date()),
    spawnSync: options.spawnSync ?? defaultSpawnSync,
    timeoutMs: Math.max(100, Math.min(5_000, options.timeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS)),
    env: options.env ?? process.env,
  })
}

export async function discoverRuntimeCommands(
  probes: readonly SandboxDiscoveryProbe[] = DEFAULT_SANDBOX_DISCOVERY_PROBES,
  options: SandboxDiscoveryOptions = {},
): Promise<ReadonlyMap<string, SandboxRunnerAvailability>> {
  const entries = await Promise.all(
    probes.map(async (probe) => [probe.id, await discoverRuntimeCommand(probe, options)] as const),
  )
  return new Map(entries)
}
