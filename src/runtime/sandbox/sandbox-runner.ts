import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'

import { redactValidationOutput } from '../validation/validation-output-redactor.js'

export type SandboxCommandBinary = 'git' | 'npm' | 'npx' | 'node' | 'prettier'
export type SandboxRunnerOutcome = 'EXECUTED' | 'BLOCKED'
export type SandboxFileWriteOutcome = 'WRITTEN' | 'BLOCKED'

export interface ParsedWorkspaceCommand {
  readonly binary: SandboxCommandBinary
  readonly args: readonly string[]
}

export interface SandboxCommandRequest extends ParsedWorkspaceCommand {
  readonly workspaceRoot: string
  readonly timeoutMs?: number
}

export interface SandboxRunnerResult {
  readonly outcome: SandboxRunnerOutcome
  readonly runner: 'docker'
  readonly command: string
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number | null
  readonly reason: string | null
}

export interface SandboxRunner {
  readonly runCommand: (request: SandboxCommandRequest) => Promise<SandboxRunnerResult>
}

export interface SandboxFileWriteRequest {
  readonly workspaceRoot: string
  readonly targetPath: string
  readonly content: string
  readonly timeoutMs?: number
}

export interface SandboxFileWriteResult {
  readonly outcome: SandboxFileWriteOutcome
  readonly runner: 'docker'
  readonly targetPath: string
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number | null
  readonly reason: string | null
}

export interface SandboxFileWriter {
  readonly writeFile: (request: SandboxFileWriteRequest) => SandboxFileWriteResult
}

export interface DockerSandboxRunnerOptions {
  readonly dockerBinary?: string
  readonly image?: string
  readonly memory?: string
  readonly cpus?: string
  readonly network?: 'none'
  readonly user?: string
  readonly timeoutMs?: number
  readonly maxOutputBytes?: number
}

interface MutableDockerSandboxRunnerOptions {
  dockerBinary?: string
  image?: string
  memory?: string
  cpus?: string
  network?: 'none'
  user?: string
  timeoutMs?: number
  maxOutputBytes?: number
}

export interface DockerSandboxResolvedConfig {
  readonly dockerBinary: string
  readonly image: string
  readonly memory: string
  readonly cpus: string
  readonly network: 'none'
  readonly user: string
  readonly timeoutMs: number
  readonly maxOutputBytes: number
}

const ALLOWED_BINARIES = new Set<SandboxCommandBinary>(['git', 'npm', 'npx', 'node', 'prettier'])
const SHELL_META_PATTERN = /[;&|`$<>\n\r]/
export const DEFAULT_DOCKER_IMAGE = 'node:22-alpine'
export const DEFAULT_SANDBOX_MEMORY = '2048m'
export const DEFAULT_SANDBOX_CPUS = '1'
export const DEFAULT_SANDBOX_NETWORK = 'none' as const
export const DEFAULT_SANDBOX_USER = 'node'
export const DEFAULT_TIMEOUT_MS = 120_000
export const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024

const FILE_WRITE_SCRIPT = [
  "const fs = require('node:fs')",
  "const path = require('node:path')",
  'const targetPath = process.argv[1]',
  'const chunks = []',
  "process.stdin.on('data', (chunk) => chunks.push(chunk))",
  "process.stdin.on('end', () => {",
  "  const root = path.resolve('/workspace')",
  '  const target = path.resolve(root, targetPath)',
  '  if (target !== root && !target.startsWith(root + path.sep)) {',
  "    console.error('workspace boundary escaped')",
  '    process.exit(71)',
  '  }',
  '  fs.mkdirSync(path.dirname(target), { recursive: true })',
  "  fs.writeFileSync(target, Buffer.concat(chunks).toString('utf8'), {",
  "    encoding: 'utf8',",
  '    mode: 0o600,',
  '  })',
  '})',
].join(';')

function firstEnvValue(env: NodeJS.ProcessEnv, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim()
    if (value !== undefined && value.length > 0) {
      return value
    }
  }
  return undefined
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined) return undefined

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined
  return parsed
}

export function resolveDockerSandboxRunnerOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): DockerSandboxRunnerOptions {
  const options: MutableDockerSandboxRunnerOptions = {}
  const dockerBinary = firstEnvValue(env, ['CODEMIND_SANDBOX_DOCKER_BINARY'])
  const image = firstEnvValue(env, ['CODEMIND_SANDBOX_IMAGE'])
  const memory = firstEnvValue(env, ['CODEMIND_SANDBOX_MEMORY'])
  const cpus = firstEnvValue(env, ['CODEMIND_SANDBOX_CPUS'])
  const user = firstEnvValue(env, ['CODEMIND_SANDBOX_USER'])
  const network = firstEnvValue(env, ['CODEMIND_SANDBOX_NETWORK'])
  const timeoutMs = parsePositiveInteger(firstEnvValue(env, ['CODEMIND_SANDBOX_TIMEOUT_MS']))
  const maxOutputBytes = parsePositiveInteger(
    firstEnvValue(env, ['CODEMIND_SANDBOX_MAX_OUTPUT_BYTES']),
  )

  if (dockerBinary !== undefined) options.dockerBinary = dockerBinary
  if (image !== undefined) options.image = image
  if (memory !== undefined) options.memory = memory
  if (cpus !== undefined) options.cpus = cpus
  if (user !== undefined) options.user = user
  if (network === 'none') options.network = 'none'
  if (timeoutMs !== undefined) options.timeoutMs = timeoutMs
  if (maxOutputBytes !== undefined) options.maxOutputBytes = maxOutputBytes

  return options
}

/**
 * Resolves the container user to match the host checkout's UID:GID so bind-mounted
 * writes (e.g. `npm run build` writing `dist/`, vitest writing its config cache) don't
 * fail with EACCES when the host owner differs from the container image's built-in user.
 * Falls back to DEFAULT_SANDBOX_USER on non-POSIX hosts where getuid/getgid don't exist.
 */
export function resolveDefaultSandboxUser(): string {
  if (typeof process.getuid === 'function' && typeof process.getgid === 'function') {
    return `${process.getuid()}:${process.getgid()}`
  }
  return DEFAULT_SANDBOX_USER
}

export function resolveDockerSandboxConfig(
  options: DockerSandboxRunnerOptions = resolveDockerSandboxRunnerOptionsFromEnv(),
): DockerSandboxResolvedConfig {
  return {
    dockerBinary: options.dockerBinary ?? 'docker',
    image: options.image ?? DEFAULT_DOCKER_IMAGE,
    memory: options.memory ?? DEFAULT_SANDBOX_MEMORY,
    cpus: options.cpus ?? DEFAULT_SANDBOX_CPUS,
    network: options.network ?? DEFAULT_SANDBOX_NETWORK,
    user: options.user ?? resolveDefaultSandboxUser(),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxOutputBytes: options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
  }
}

export function renderDockerSandboxConfig(
  config: DockerSandboxResolvedConfig = resolveDockerSandboxConfig(),
): string {
  return [
    `docker=${config.dockerBinary}`,
    `image=${config.image}`,
    `memory=${config.memory}`,
    `cpus=${config.cpus}`,
    `network=${config.network}`,
    `user=${config.user}`,
    `timeoutMs=${config.timeoutMs}`,
    `maxOutputBytes=${config.maxOutputBytes}`,
  ].join('; ')
}

export function parseWorkspaceCommand(command: string): ParsedWorkspaceCommand {
  const trimmed = command.trim()

  if (trimmed.length === 0) {
    throw new Error('Sandbox command must not be empty.')
  }

  if (SHELL_META_PATTERN.test(trimmed)) {
    throw new Error('Sandbox command contains shell metacharacters and was rejected.')
  }

  const parts = trimmed.split(/\s+/)
  const [rawBinary, ...args] = parts

  if (rawBinary === undefined || !ALLOWED_BINARIES.has(rawBinary as SandboxCommandBinary)) {
    throw new Error(`Sandbox command binary is not allowed: ${rawBinary ?? 'unknown'}`)
  }

  return {
    binary: rawBinary as SandboxCommandBinary,
    args,
  }
}

export function renderSandboxCommand(command: ParsedWorkspaceCommand): string {
  return [command.binary, ...command.args].join(' ')
}

function buildDockerWorkspaceArgs(
  workspaceRoot: string,
  options: DockerSandboxRunnerOptions = {},
): readonly string[] {
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot)
  const config = resolveDockerSandboxConfig(options)

  return [
    'run',
    '--rm',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges:true',
    '--network',
    config.network,
    '--memory',
    config.memory,
    '--cpus',
    config.cpus,
    '--user',
    config.user,
    // HOME must be set explicitly: --user may pass a host UID:GID with no matching
    // /etc/passwd entry in the container image, so os.homedir() has nothing to resolve
    // and falls back to "/", which a non-root user can't write to. Anything that resolves
    // a home-relative path (e.g. resolveStoragePaths()) would otherwise fail with EACCES.
    '--env',
    'HOME=/workspace',
    '-v',
    `${resolvedWorkspaceRoot}:/workspace:rw`,
    '-w',
    '/workspace',
    config.image,
  ]
}

export function buildDockerRunArgs(
  request: SandboxCommandRequest,
  options: DockerSandboxRunnerOptions = {},
): readonly string[] {
  return [
    ...buildDockerWorkspaceArgs(request.workspaceRoot, options),
    request.binary,
    ...request.args,
  ]
}

export function buildDockerFileWriteArgs(
  request: SandboxFileWriteRequest,
  options: DockerSandboxRunnerOptions = {},
): readonly string[] {
  return [
    ...buildDockerWorkspaceArgs(request.workspaceRoot, options),
    'node',
    '-e',
    FILE_WRITE_SCRIPT,
    request.targetPath,
  ]
}

export class DockerSandboxRunner implements SandboxRunner {
  private readonly dockerBinary: string
  private readonly options: DockerSandboxRunnerOptions

  public constructor(
    options: DockerSandboxRunnerOptions = resolveDockerSandboxRunnerOptionsFromEnv(),
  ) {
    const config = resolveDockerSandboxConfig(options)
    this.dockerBinary = config.dockerBinary
    this.options = options
  }

  public async runCommand(request: SandboxCommandRequest): Promise<SandboxRunnerResult> {
    const timeoutMs = request.timeoutMs ?? this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const maxOutputBytes = this.options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
    const args = buildDockerRunArgs(request, this.options)
    const command = renderSandboxCommand(request)

    return new Promise<SandboxRunnerResult>((resolve) => {
      const child = spawn(this.dockerBinary, args, {
        timeout: timeoutMs,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []
      let outputBytes = 0
      let outputLimitExceeded = false

      const recordChunk = (chunks: Buffer[], chunk: Buffer): void => {
        outputBytes += chunk.byteLength
        if (outputBytes > maxOutputBytes) {
          outputLimitExceeded = true
          child.kill('SIGKILL')
          return
        }
        chunks.push(chunk)
      }

      child.stdout.on('data', (chunk: Buffer) => recordChunk(stdoutChunks, chunk))
      child.stderr.on('data', (chunk: Buffer) => recordChunk(stderrChunks, chunk))

      child.on('error', (error) => {
        resolve({
          outcome: 'BLOCKED',
          runner: 'docker',
          command,
          stdout: '',
          stderr: '',
          exitCode: null,
          reason: `Sandbox runner unavailable; host execution is not allowed. ${error.message}`,
        })
      })

      child.on('close', (code) => {
        const stdout = redactValidationOutput(Buffer.concat(stdoutChunks).toString('utf-8'))
        const stderr = redactValidationOutput(Buffer.concat(stderrChunks).toString('utf-8'))
        resolve({
          outcome: outputLimitExceeded ? 'BLOCKED' : 'EXECUTED',
          runner: 'docker',
          command,
          stdout,
          stderr,
          exitCode: code,
          reason: outputLimitExceeded ? 'Sandbox output limit exceeded.' : null,
        })
      })
    })
  }
}

export class DockerSandboxFileWriter implements SandboxFileWriter {
  private readonly dockerBinary: string
  private readonly options: DockerSandboxRunnerOptions

  public constructor(
    options: DockerSandboxRunnerOptions = resolveDockerSandboxRunnerOptionsFromEnv(),
  ) {
    const config = resolveDockerSandboxConfig(options)
    this.dockerBinary = config.dockerBinary
    this.options = options
  }

  public writeFile(request: SandboxFileWriteRequest): SandboxFileWriteResult {
    const args = buildDockerFileWriteArgs(request, this.options)
    const result = spawnSync(this.dockerBinary, args, {
      input: request.content,
      encoding: 'utf8',
      timeout: request.timeoutMs ?? this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: this.options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    })

    const stdout = redactValidationOutput(result.stdout ?? '')
    const stderr = redactValidationOutput(result.stderr ?? '')

    if (result.error !== undefined) {
      return {
        outcome: 'BLOCKED',
        runner: 'docker',
        targetPath: request.targetPath,
        stdout,
        stderr,
        exitCode: result.status,
        reason: `Sandbox file writer unavailable; host file writes are not allowed. ${result.error.message}`,
      }
    }

    if (result.status !== 0) {
      return {
        outcome: 'BLOCKED',
        runner: 'docker',
        targetPath: request.targetPath,
        stdout,
        stderr,
        exitCode: result.status,
        reason: 'Sandbox file writer failed.',
      }
    }

    return {
      outcome: 'WRITTEN',
      runner: 'docker',
      targetPath: request.targetPath,
      stdout,
      stderr,
      exitCode: result.status,
      reason: null,
    }
  }
}
