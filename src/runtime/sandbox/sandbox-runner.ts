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

const ALLOWED_BINARIES = new Set<SandboxCommandBinary>(['git', 'npm', 'npx', 'node', 'prettier'])
const SHELL_META_PATTERN = /[;&|`$<>\n\r]/
const DEFAULT_DOCKER_IMAGE = 'node:22-alpine'
const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024

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
  "  fs.writeFileSync(target, Buffer.concat(chunks).toString('utf8'), { encoding: 'utf8', mode: 0o600 })",
  '})',
].join(';')

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

  return [
    'run',
    '--rm',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges:true',
    '--network',
    options.network ?? 'none',
    '--memory',
    options.memory ?? '512m',
    '--cpus',
    options.cpus ?? '1',
    '--user',
    options.user ?? 'node',
    '-v',
    `${resolvedWorkspaceRoot}:/workspace:rw`,
    '-w',
    '/workspace',
    options.image ?? DEFAULT_DOCKER_IMAGE,
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

  public constructor(options: DockerSandboxRunnerOptions = {}) {
    this.dockerBinary = options.dockerBinary ?? 'docker'
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

  public constructor(options: DockerSandboxRunnerOptions = {}) {
    this.dockerBinary = options.dockerBinary ?? 'docker'
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
