import { spawn } from 'node:child_process'

import type { SandboxRunnerAvailability } from './sandbox-types.js'

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
}

const DEFAULT_DISCOVERY_TIMEOUT_MS = 2_000

function safeDiscoveryEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    PATH: env['PATH'] ?? '',
    HOME: '',
    LANG: env['LANG'] ?? 'C.UTF-8',
  }
}

export async function discoverRuntimeCommand(
  probe: SandboxDiscoveryProbe,
  options: SandboxDiscoveryOptions = {},
): Promise<SandboxRunnerAvailability> {
  const now = options.now ?? (() => new Date())
  const timeoutMs = options.timeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS
  const env = safeDiscoveryEnv(options.env ?? process.env)

  return new Promise<SandboxRunnerAvailability>((resolve) => {
    const child = spawn(probe.command, probe.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env,
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({
        status: 'misconfigured',
        reason: `${probe.command} discovery timed out after ${timeoutMs}ms`,
        checkedAt: now().toISOString(),
      })
    }, timeoutMs)
    const chunks: Buffer[] = []
    let settled = false

    const settle = (availability: SandboxRunnerAvailability): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(availability)
    }

    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk))

    child.on('error', (error) => {
      settle({
        status: 'unavailable',
        reason: `${probe.command} was not detected: ${error.message}`,
        checkedAt: now().toISOString(),
      })
    })

    child.on('close', (code) => {
      const output = Buffer.concat(chunks).toString('utf8').trim()
      if (code !== 0) {
        settle({
          status: 'misconfigured',
          reason: `${probe.command} exited with ${code ?? 'unknown'} during discovery`,
          checkedAt: now().toISOString(),
        })
        return
      }
      const versionMatch = probe.versionPattern?.exec(output)
      settle({
        status: 'available',
        ...(versionMatch?.[1] === undefined ? {} : { version: versionMatch[1] }),
        checkedAt: now().toISOString(),
      })
    })
  })
}

export async function discoverRuntimeCommands(
  probes: readonly SandboxDiscoveryProbe[],
  options: SandboxDiscoveryOptions = {},
): Promise<ReadonlyMap<string, SandboxRunnerAvailability>> {
  const entries = await Promise.all(
    probes.map(async (probe) => [probe.id, await discoverRuntimeCommand(probe, options)] as const),
  )
  return new Map(entries)
}
