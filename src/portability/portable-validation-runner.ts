import { spawn } from 'node:child_process'
import path from 'node:path'

import { readEnvWithLegacyFallback } from '../config/env-compat.js'
import { redactValidationOutput } from '../runtime/validation/validation-output-redactor.js'
import type { RuntimePolicySnapshot } from '../runtime/types.js'
import {
  isSafePortableValidationCommand,
  sandboxImageForValidationCommand,
} from './repository-portability.js'

export interface PortableValidationRequest {
  readonly repositoryRoot: string
  readonly command: string
  readonly policy: RuntimePolicySnapshot
  readonly timeoutMs?: number
  readonly maxOutputBytes?: number
}

export interface PortableValidationResult {
  readonly outcome: 'PASS' | 'FAIL' | 'BLOCKED' | 'ERROR'
  readonly command: string
  readonly image: string
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
  readonly durationMs: number
  readonly reason?: string
}

export interface PortableValidationRunner {
  run(request: PortableValidationRequest): Promise<PortableValidationResult>
}

export interface PortableSpawnedProcess {
  readonly stdout: NodeJS.ReadableStream
  readonly stderr: NodeJS.ReadableStream
  kill(signal?: NodeJS.Signals | number): boolean
  on(event: 'error', listener: (error: Error) => void): this
  on(event: 'close', listener: (code: number | null) => void): this
}

export type PortableSpawn = (
  binary: string,
  args: readonly string[],
  options: {
    readonly timeout: number
    readonly stdio: readonly ['ignore', 'pipe', 'pipe']
  },
) => PortableSpawnedProcess

const defaultPortableSpawn: PortableSpawn = (binary, args, options) =>
  spawn(binary, [...args], {
    timeout: options.timeout,
    stdio: [...options.stdio],
  }) as PortableSpawnedProcess

export class DockerPortableValidationRunner implements PortableValidationRunner {
  readonly #dockerBinary: string
  readonly #spawn: PortableSpawn

  constructor(
    dockerBinary = readEnvWithLegacyFallback(
      'SYMBOLWRIGHT_SANDBOX_DOCKER_BINARY',
      'CODEMIND_SANDBOX_DOCKER_BINARY',
      { env: process.env },
    )?.trim() || 'docker',
    spawnProcess: PortableSpawn = defaultPortableSpawn,
  ) {
    this.#dockerBinary = dockerBinary
    this.#spawn = spawnProcess
  }

  async run(request: PortableValidationRequest): Promise<PortableValidationResult> {
    const startedAt = Date.now()
    const command = request.command.trim()
    const image = sandboxImageForValidationCommand(command)
    if (!request.policy.allowShell) {
      return blocked(command, image, startedAt, 'Shell execution is disabled by runtime policy.')
    }
    if (!isSafePortableValidationCommand(command)) {
      return blocked(
        command,
        image,
        startedAt,
        `Portable validation command is not allowlisted: ${command}`,
      )
    }

    const [binary, ...args] = command.split(/\s+/)
    if (binary === undefined)
      return blocked(command, image, startedAt, 'Validation command is empty.')
    const repositoryRoot = path.resolve(request.repositoryRoot)
    const user =
      typeof process.getuid === 'function' && typeof process.getgid === 'function'
        ? `${process.getuid()}:${process.getgid()}`
        : '1000:1000'
    const dockerArgs = [
      'run',
      '--rm',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges:true',
      '--network',
      'none',
      '--memory',
      readEnvWithLegacyFallback('SYMBOLWRIGHT_SANDBOX_MEMORY', 'CODEMIND_SANDBOX_MEMORY', {
        env: process.env,
      })?.trim() || '2048m',
      '--cpus',
      readEnvWithLegacyFallback('SYMBOLWRIGHT_SANDBOX_CPUS', 'CODEMIND_SANDBOX_CPUS', {
        env: process.env,
      })?.trim() || '1',
      '--user',
      user,
      '--env',
      'HOME=/workspace',
      '-v',
      `${repositoryRoot}:/workspace:rw`,
      '-w',
      '/workspace',
      image,
      binary,
      ...args,
    ]

    return new Promise((resolve) => {
      const child = this.#spawn(this.#dockerBinary, dockerArgs, {
        timeout: request.timeoutMs ?? 180_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const stdout: Buffer[] = []
      const stderr: Buffer[] = []
      const maxOutputBytes = request.maxOutputBytes ?? 1024 * 1024
      let outputBytes = 0
      let exceeded = false
      const record = (target: Buffer[], chunk: Buffer): void => {
        outputBytes += chunk.byteLength
        if (outputBytes > maxOutputBytes) {
          exceeded = true
          child.kill('SIGKILL')
          return
        }
        target.push(chunk)
      }
      child.stdout.on('data', (chunk: Buffer) => record(stdout, chunk))
      child.stderr.on('data', (chunk: Buffer) => record(stderr, chunk))
      child.on('error', (error) => {
        resolve({
          outcome: 'ERROR',
          command,
          image,
          exitCode: null,
          stdout: '',
          stderr: '',
          durationMs: Date.now() - startedAt,
          reason: `Portable sandbox runner unavailable; host execution is not allowed. ${error.message}`,
        })
      })
      child.on('close', (code) => {
        const renderedStdout = redactValidationOutput(Buffer.concat(stdout).toString('utf8'))
        const renderedStderr = redactValidationOutput(Buffer.concat(stderr).toString('utf8'))
        resolve({
          outcome: exceeded ? 'BLOCKED' : code === 0 ? 'PASS' : 'FAIL',
          command,
          image,
          exitCode: code,
          stdout: renderedStdout,
          stderr: renderedStderr,
          durationMs: Date.now() - startedAt,
          ...(exceeded ? { reason: 'Portable sandbox output limit exceeded.' } : {}),
        })
      })
    })
  }
}

function blocked(
  command: string,
  image: string,
  startedAt: number,
  reason: string,
): PortableValidationResult {
  return {
    outcome: 'BLOCKED',
    command,
    image,
    exitCode: null,
    stdout: '',
    stderr: '',
    durationMs: Date.now() - startedAt,
    reason,
  }
}
