import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
  type SpawnSyncReturns,
} from 'node:child_process'
import path from 'node:path'

import { SANDBOX_OFFLINE_EXECUTE_CAPABILITY } from '../access/sandbox-capabilities.js'
import { redactValidationOutput } from '../runtime/validation/validation-output-redactor.js'
import {
  getSandboxCommandProfile,
  parseSandboxCommand,
  type EffectiveSandboxCommandPolicy,
  type SandboxCommandProfileId,
  type SandboxCommandWorkspaceTrust,
} from './sandbox-command-policy.js'
import { SandboxExecutionBroker } from './sandbox-execution-broker.js'
import type { SandboxAuthorizationContext } from './sandbox-policy-model.js'

export type SandboxCommandBinary =
  | 'git'
  | 'npm'
  | 'npx'
  | 'node'
  | 'prettier'
  | 'python'
  | 'python3'
  | 'pytest'
  | 'go'
  | 'gofmt'
  | 'cargo'
  | 'rustc'
  | 'mvn'
  | './mvnw'
  | 'gradle'
  | './gradlew'
  | 'dotnet'
  | 'ruby'
  | 'bundle'
  | 'rake'
  | 'php'
  | 'composer'

export type SandboxRunnerOutcome = 'EXECUTED' | 'BLOCKED'
export type SandboxFileWriteOutcome = 'WRITTEN' | 'BLOCKED'

export interface ParsedWorkspaceCommand {
  readonly binary: SandboxCommandBinary
  readonly args: readonly string[]
}

export interface SandboxCommandRequest extends ParsedWorkspaceCommand {
  readonly workspaceRoot: string
  readonly timeoutMs?: number
  readonly maxOutputBytes?: number
  readonly profileId?: SandboxCommandProfileId
  readonly workspaceTrust?: SandboxCommandWorkspaceTrust
  readonly authorization?: SandboxAuthorizationContext
}

export interface SandboxRunnerResult {
  readonly outcome: SandboxRunnerOutcome
  readonly runner: 'docker'
  readonly command: string
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number | null
  readonly reason: string | null
  readonly reasonCode?: string
  readonly policy?: EffectiveSandboxCommandPolicy
}

export interface SandboxRunner {
  readonly runCommand: (request: SandboxCommandRequest) => Promise<SandboxRunnerResult>
}

export interface SandboxFileWriteRequest {
  readonly workspaceRoot: string
  readonly targetPath: string
  readonly content: string
  readonly timeoutMs?: number
  readonly authorization?: SandboxAuthorizationContext
  readonly workspaceTrust?: SandboxCommandWorkspaceTrust
}

export interface SandboxFileWriteResult {
  readonly outcome: SandboxFileWriteOutcome
  readonly runner: 'docker'
  readonly targetPath: string
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number | null
  readonly reason: string | null
  readonly reasonCode?: string
}

export interface SandboxFileWriter {
  readonly writeFile: (request: SandboxFileWriteRequest) => SandboxFileWriteResult
}

export type SandboxCommandSpawn = (
  command: string,
  args: readonly string[],
  options: { readonly timeout: number; readonly stdio: ['ignore', 'pipe', 'pipe'] },
) => ChildProcessWithoutNullStreams

export type SandboxCommandSpawnSync = (
  command: string,
  args: readonly string[],
  options: {
    readonly input: string
    readonly encoding: 'utf8'
    readonly timeout: number
    readonly maxBuffer: number
  },
) => SpawnSyncReturns<string>

const DEFAULT_SPAWN_PROCESS: SandboxCommandSpawn = (command, args, options) =>
  spawn(command, [...args], options) as unknown as ChildProcessWithoutNullStreams

const DEFAULT_SPAWN_SYNC_PROCESS: SandboxCommandSpawnSync = (command, args, options) =>
  spawnSync(command, [...args], options)

export interface DockerSandboxRunnerOptions {
  readonly dockerBinary?: string
  readonly image?: string
  readonly memory?: string
  readonly cpus?: string
  readonly network?: 'none'
  readonly user?: string
  readonly timeoutMs?: number
  readonly maxOutputBytes?: number
  readonly env?: NodeJS.ProcessEnv
  readonly broker?: SandboxExecutionBroker
  readonly authorization?: SandboxAuthorizationContext
  readonly profileId?: SandboxCommandProfileId
  readonly workspaceTrust?: SandboxCommandWorkspaceTrust
  readonly spawnProcess?: SandboxCommandSpawn
  readonly spawnSyncProcess?: SandboxCommandSpawnSync
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

const RUNTIME_BINARIES = new Set<SandboxCommandBinary>(['git', 'npm', 'npx', 'node', 'prettier'])

export const DEFAULT_DOCKER_IMAGE = 'node:22-bookworm'
export const DEFAULT_SANDBOX_MEMORY = '2048m'
export const DEFAULT_SANDBOX_CPUS = '1'
export const DEFAULT_SANDBOX_NETWORK = 'none' as const
export const DEFAULT_SANDBOX_USER = 'node'
export const DEFAULT_TIMEOUT_MS = 300_000
export const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024

const FILE_WRITE_SCRIPT = `
const fs = require('node:fs');
const path = require('node:path');
const targetPath = process.argv[1];
const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  const root = path.resolve('/workspace');
  const target = path.resolve(root, targetPath);
  if (target !== root && !target.startsWith(root + path.sep)) {
    console.error('workspace boundary escaped');
    process.exit(71);
  }
  function realContainingPath(candidate) {
    let current = candidate;
    const trailing = [];
    for (;;) {
      try {
        const real = fs.realpathSync(current);
        return trailing.length === 0 ? real : path.join(real, ...trailing.reverse());
      } catch {
        const parent = path.dirname(current);
        if (parent === current) return candidate;
        trailing.push(path.basename(current));
        current = parent;
      }
    }
  }
  const realRoot = realContainingPath(root);
  const realTarget = realContainingPath(target);
  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + path.sep)) {
    console.error('workspace boundary escaped');
    process.exit(71);
  }
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(
    dir,
    '.' + path.basename(target) + '.tmp-' + process.pid + '-' + Date.now().toString(36),
  );
  const content = Buffer.concat(chunks).toString('utf8');
  try {
    fs.writeFileSync(tempPath, content, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, target);
  } catch (error) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
    throw error;
  }
});
`

function firstEnvValue(env: NodeJS.ProcessEnv, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim()
    if (value !== undefined && value.length > 0) return value
  }
  return undefined
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

export function resolveDockerSandboxRunnerOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): DockerSandboxRunnerOptions {
  const options: MutableDockerSandboxRunnerOptions = {}
  const dockerBinary = firstEnvValue(env, [
    'SYMBOLWRIGHT_SANDBOX_DOCKER_BINARY',
    'CODEMIND_SANDBOX_DOCKER_BINARY',
  ])
  const image = firstEnvValue(env, ['SYMBOLWRIGHT_SANDBOX_IMAGE', 'CODEMIND_SANDBOX_IMAGE'])
  const memory = firstEnvValue(env, ['SYMBOLWRIGHT_SANDBOX_MEMORY', 'CODEMIND_SANDBOX_MEMORY'])
  const cpus = firstEnvValue(env, ['SYMBOLWRIGHT_SANDBOX_CPUS', 'CODEMIND_SANDBOX_CPUS'])
  const user = firstEnvValue(env, ['SYMBOLWRIGHT_SANDBOX_USER', 'CODEMIND_SANDBOX_USER'])
  const network = firstEnvValue(env, ['SYMBOLWRIGHT_SANDBOX_NETWORK', 'CODEMIND_SANDBOX_NETWORK'])
  const timeoutMs = parsePositiveInteger(
    firstEnvValue(env, ['SYMBOLWRIGHT_SANDBOX_TIMEOUT_MS', 'CODEMIND_SANDBOX_TIMEOUT_MS']),
  )
  const maxOutputBytes = parsePositiveInteger(
    firstEnvValue(env, [
      'SYMBOLWRIGHT_SANDBOX_MAX_OUTPUT_BYTES',
      'CODEMIND_SANDBOX_MAX_OUTPUT_BYTES',
    ]),
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

export function resolveDefaultSandboxUser(): string {
  if (typeof process.getuid === 'function' && typeof process.getgid === 'function') {
    return `${process.getuid()}:${process.getgid()}`
  }
  return DEFAULT_SANDBOX_USER
}

export function resolveDockerSandboxConfig(
  options: DockerSandboxRunnerOptions = resolveDockerSandboxRunnerOptionsFromEnv(),
): DockerSandboxResolvedConfig {
  const profile = getSandboxCommandProfile(options.profileId ?? 'trusted-local-runtime-node')
  return {
    dockerBinary: options.dockerBinary ?? 'docker',
    image: options.image ?? profile?.image ?? DEFAULT_DOCKER_IMAGE,
    memory: options.memory ?? DEFAULT_SANDBOX_MEMORY,
    cpus: options.cpus ?? DEFAULT_SANDBOX_CPUS,
    network: options.network ?? DEFAULT_SANDBOX_NETWORK,
    user: options.user ?? resolveDefaultSandboxUser(),
    timeoutMs: options.timeoutMs ?? profile?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxOutputBytes: options.maxOutputBytes ?? profile?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
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
  const parsed = parseSandboxCommand(command)
  if (!RUNTIME_BINARIES.has(parsed.binary as SandboxCommandBinary)) {
    throw new Error(`Sandbox command binary is not allowed: ${parsed.binary}`)
  }
  return { binary: parsed.binary as SandboxCommandBinary, args: parsed.args }
}

export function renderSandboxCommand(command: ParsedWorkspaceCommand): string {
  return [command.binary, ...command.args].join(' ')
}

function buildDockerWorkspaceArgs(
  workspaceRoot: string,
  options: DockerSandboxRunnerOptions,
  policy?: EffectiveSandboxCommandPolicy,
): readonly string[] {
  const config = resolveDockerSandboxConfig(options)
  return [
    'run',
    '--rm',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges:true',
    '--network',
    'none',
    '--memory',
    config.memory,
    '--cpus',
    config.cpus,
    '--user',
    config.user,
    '--env',
    'HOME=/workspace',
    '-v',
    `${path.resolve(workspaceRoot)}:/workspace:rw`,
    '-w',
    '/workspace',
    policy?.image ?? config.image,
  ]
}

export function buildDockerRunArgs(
  request: SandboxCommandRequest,
  options: DockerSandboxRunnerOptions = {},
  policy?: EffectiveSandboxCommandPolicy,
): readonly string[] {
  return [
    ...buildDockerWorkspaceArgs(request.workspaceRoot, options, policy),
    request.binary,
    ...request.args,
  ]
}

export function buildDockerFileWriteArgs(
  request: SandboxFileWriteRequest,
  options: DockerSandboxRunnerOptions = {},
  policy?: EffectiveSandboxCommandPolicy,
): readonly string[] {
  return [
    ...buildDockerWorkspaceArgs(request.workspaceRoot, options, policy),
    'node',
    '-e',
    FILE_WRITE_SCRIPT,
    request.targetPath,
  ]
}

export class DockerSandboxRunner implements SandboxRunner {
  private readonly options: DockerSandboxRunnerOptions
  private readonly env: NodeJS.ProcessEnv
  private readonly broker: SandboxExecutionBroker
  private readonly spawnProcess: SandboxCommandSpawn

  public constructor(
    options: DockerSandboxRunnerOptions = resolveDockerSandboxRunnerOptionsFromEnv(),
  ) {
    this.options = options
    this.env = options.env ?? process.env
    this.broker = options.broker ?? new SandboxExecutionBroker({ env: this.env })
    this.spawnProcess = options.spawnProcess ?? DEFAULT_SPAWN_PROCESS
  }

  public async runCommand(request: SandboxCommandRequest): Promise<SandboxRunnerResult> {
    const command = renderSandboxCommand(request)
    const authorization =
      request.authorization ?? this.options.authorization ?? defaultAuthorization(request, this.env)
    const decision = this.broker.authorizeCommand(
      {
        command,
        workspaceRoot: request.workspaceRoot,
        workspaceTrust: request.workspaceTrust ?? this.options.workspaceTrust ?? 'trusted-local',
        profileId: request.profileId ?? this.options.profileId ?? 'trusted-local-runtime-node',
        ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
        ...(request.maxOutputBytes === undefined ? {} : { maxOutputBytes: request.maxOutputBytes }),
      },
      authorization,
    )
    if (!decision.allowed || decision.policy === undefined) {
      return blockedRunnerResult(command, decision.reasonCode, decision.reason)
    }

    const policy = decision.policy
    const config = resolveDockerSandboxConfig(this.options)
    const args = buildDockerRunArgs(request, this.options, policy)
    return new Promise<SandboxRunnerResult>((resolve) => {
      const child = this.spawnProcess(config.dockerBinary, args, {
        timeout: policy.limits.timeoutMs,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []
      let outputBytes = 0
      let outputLimitExceeded = false
      let settled = false

      const finish = (result: SandboxRunnerResult): void => {
        if (settled) return
        settled = true
        resolve(result)
      }
      const recordChunk = (chunks: Buffer[], chunk: Buffer): void => {
        const remaining = policy.limits.maxOutputBytes - outputBytes
        if (remaining <= 0) {
          outputLimitExceeded = true
          child.kill('SIGKILL')
          return
        }
        outputBytes += Math.min(remaining, chunk.byteLength)
        chunks.push(chunk.subarray(0, remaining))
        if (chunk.byteLength > remaining) {
          outputLimitExceeded = true
          child.kill('SIGKILL')
        }
      }

      child.stdout.on('data', (chunk: Buffer) => recordChunk(stdoutChunks, chunk))
      child.stderr.on('data', (chunk: Buffer) => recordChunk(stderrChunks, chunk))
      child.once('error', (error) => {
        finish({
          ...blockedRunnerResult(
            command,
            'SANDBOX_COMMAND_BACKEND_UNAVAILABLE',
            `Sandbox runner unavailable; host execution is not allowed. ${error.message}`,
          ),
          policy,
        })
      })
      child.once('close', (code) => {
        const stdout = redactValidationOutput(Buffer.concat(stdoutChunks).toString('utf-8'))
        const stderr = redactValidationOutput(Buffer.concat(stderrChunks).toString('utf-8'))
        finish({
          outcome: outputLimitExceeded ? 'BLOCKED' : 'EXECUTED',
          runner: 'docker',
          command,
          stdout,
          stderr,
          exitCode: code,
          reason: outputLimitExceeded ? 'Sandbox output limit exceeded.' : null,
          ...(outputLimitExceeded ? { reasonCode: 'SANDBOX_COMMAND_OUTPUT_LIMIT' } : {}),
          policy,
        })
      })
    })
  }
}

export class DockerSandboxFileWriter implements SandboxFileWriter {
  private readonly options: DockerSandboxRunnerOptions
  private readonly env: NodeJS.ProcessEnv
  private readonly broker: SandboxExecutionBroker
  private readonly spawnSyncProcess: SandboxCommandSpawnSync

  public constructor(
    options: DockerSandboxRunnerOptions = resolveDockerSandboxRunnerOptionsFromEnv(),
  ) {
    this.options = options
    this.env = options.env ?? process.env
    this.broker = options.broker ?? new SandboxExecutionBroker({ env: this.env })
    this.spawnSyncProcess = options.spawnSyncProcess ?? DEFAULT_SPAWN_SYNC_PROCESS
  }

  public writeFile(request: SandboxFileWriteRequest): SandboxFileWriteResult {
    const authorization =
      request.authorization ?? this.options.authorization ?? defaultAuthorization(request, this.env)
    const decision = this.broker.authorizeCommand(
      {
        command: 'node',
        workspaceRoot: request.workspaceRoot,
        workspaceTrust: request.workspaceTrust ?? this.options.workspaceTrust ?? 'trusted-local',
        profileId: 'trusted-local-runtime-node',
        ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
      },
      authorization,
    )
    if (!decision.allowed || decision.policy === undefined) {
      return blockedFileResult(request.targetPath, decision.reasonCode, decision.reason)
    }

    const policy = decision.policy
    const config = resolveDockerSandboxConfig(this.options)
    const result = this.spawnSyncProcess(
      config.dockerBinary,
      buildDockerFileWriteArgs(request, this.options, policy),
      {
        input: request.content,
        encoding: 'utf8',
        timeout: policy.limits.timeoutMs,
        maxBuffer: policy.limits.maxOutputBytes,
      },
    )
    const stdout = redactValidationOutput(result.stdout ?? '')
    const stderr = redactValidationOutput(result.stderr ?? '')
    if (result.error !== undefined) {
      return {
        ...blockedFileResult(
          request.targetPath,
          'SANDBOX_FILE_WRITE_BACKEND_UNAVAILABLE',
          `Sandbox file writer unavailable; host file writes are not allowed. ${result.error.message}`,
        ),
        stdout,
        stderr,
        exitCode: result.status,
      }
    }
    if (result.status !== 0) {
      return {
        ...blockedFileResult(
          request.targetPath,
          'SANDBOX_FILE_WRITE_FAILED',
          'Sandbox file writer failed.',
        ),
        stdout,
        stderr,
        exitCode: result.status,
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

function blockedRunnerResult(
  command: string,
  reasonCode: string,
  reason: string,
): SandboxRunnerResult {
  return {
    outcome: 'BLOCKED',
    runner: 'docker',
    command,
    stdout: '',
    stderr: '',
    exitCode: null,
    reason,
    reasonCode,
  }
}

function blockedFileResult(
  targetPath: string,
  reasonCode: string,
  reason: string,
): SandboxFileWriteResult {
  return {
    outcome: 'BLOCKED',
    runner: 'docker',
    targetPath,
    stdout: '',
    stderr: '',
    exitCode: null,
    reason,
    reasonCode,
  }
}

function defaultAuthorization(
  request: { readonly workspaceRoot: string },
  env: NodeJS.ProcessEnv,
): SandboxAuthorizationContext {
  const root = path.resolve(request.workspaceRoot)
  return {
    deploymentMode:
      env['SYMBOLWRIGHT_DEPLOYMENT_MODE']?.trim().toLowerCase() === 'hosted' ? 'hosted' : 'local',
    callerKind: 'operator',
    runtimeMode: 'APPROVED_EXECUTION',
    approvedCapabilityIds: [SANDBOX_OFFLINE_EXECUTE_CAPABILITY],
    repositoryId: root,
    workspaceId: root,
    intent: 'offline-execution',
  }
}
