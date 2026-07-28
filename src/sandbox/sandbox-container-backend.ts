import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'

import {
  buildSandboxContainerCommandPlan,
  type SandboxContainerCommandPlan,
} from './sandbox-container-command-plan.js'
import {
  cleanupSandboxContainerWorkspace,
  materializeSandboxContainerWorkspace,
  quarantineSandboxContainerArtifacts,
  SandboxWorkspaceBoundaryError,
  type MaterializedSandboxWorkspace,
} from './sandbox-container-workspace.js'
import type { SandboxContainerEngineStatus } from './sandbox-images.js'
import type {
  SandboxDiagnostic,
  SandboxExecutionRequest,
  SandboxExecutionResult,
  SandboxImageDefinition,
  SandboxRunnerDefinition,
  VerificationLevel,
} from './sandbox-types.js'

const CONTROL_COMMAND_TIMEOUT_MS = 15_000
const CONTROL_COMMAND_OUTPUT_BYTES = 64 * 1024
const REAPER_TIMEOUT_MS = 20_000

export interface SandboxBackendExecutionController {
  cancel(): void
  readonly completed: Promise<SandboxExecutionResult>
}

export interface StrongSandboxReaperReport {
  readonly attempted: boolean
  readonly engine: 'docker' | 'podman' | 'none'
  readonly removedContainerIds: readonly string[]
  readonly warnings: readonly string[]
}

export interface ExecuteStrongSandboxContainerInput {
  readonly executionId: string
  readonly request: SandboxExecutionRequest
  readonly runner: SandboxRunnerDefinition
  readonly image: SandboxImageDefinition
  readonly engine: SandboxContainerEngineStatus
  readonly startedAt: string
  readonly now: () => Date
  readonly env?: NodeJS.ProcessEnv
  readonly stateRoot?: string
  readonly onStart?: (controller: SandboxBackendExecutionController) => void
}

interface CommandOutcome {
  readonly exitCode: number | null
  readonly signal?: string
  readonly stdout: string
  readonly stderr: string
  readonly timedOut: boolean
  readonly cancelled: boolean
  readonly outputLimited: boolean
}

export async function executeStrongSandboxContainer(
  input: ExecuteStrongSandboxContainerInput,
): Promise<SandboxExecutionResult> {
  const controller = new StrongSandboxContainerController(input)
  input.onStart?.(controller)
  return controller.completed
}

export async function reapStrongSandboxOrphans(
  engine: SandboxContainerEngineStatus,
  env: NodeJS.ProcessEnv = process.env,
): Promise<StrongSandboxReaperReport> {
  if (engine.status !== 'available' || (engine.engine !== 'docker' && engine.engine !== 'podman')) {
    return {
      attempted: false,
      engine: engine.engine,
      removedContainerIds: [],
      warnings: [engine.reason],
    }
  }
  const list = await runStandaloneCommand(
    [
      engine.engine,
      'ps',
      '--all',
      '--quiet',
      '--filter',
      'label=symbolwright.sandbox.managed=true',
    ],
    env,
    REAPER_TIMEOUT_MS,
  )
  if (list.exitCode !== 0) {
    return {
      attempted: true,
      engine: engine.engine,
      removedContainerIds: [],
      warnings: [`Container orphan discovery failed: ${boundedMessage(list.stderr || list.stdout)}`],
    }
  }
  const ids = list.stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => /^[a-f0-9]{12,64}$/.test(value))
  const removed: string[] = []
  const warnings: string[] = []
  for (const id of ids) {
    const removal = await runStandaloneCommand(
      [engine.engine, 'rm', '--force', '--volumes', id],
      env,
      REAPER_TIMEOUT_MS,
    )
    if (removal.exitCode === 0) removed.push(id)
    else warnings.push(`Could not reap container ${id}: ${boundedMessage(removal.stderr)}`)
  }
  return {
    attempted: true,
    engine: engine.engine,
    removedContainerIds: removed,
    warnings,
  }
}

class StrongSandboxContainerController implements SandboxBackendExecutionController {
  readonly completed: Promise<SandboxExecutionResult>
  private readonly input: ExecuteStrongSandboxContainerInput
  private readonly env: NodeJS.ProcessEnv
  private activeChild: ChildProcessWithoutNullStreams | undefined
  private plan: SandboxContainerCommandPlan | undefined
  private cancelled = false

  constructor(input: ExecuteStrongSandboxContainerInput) {
    this.input = input
    this.env = safeEngineEnvironment(input.env ?? process.env)
    this.completed = this.run()
  }

  cancel(): void {
    this.cancelled = true
    this.activeChild?.kill('SIGKILL')
    this.forceKillContainer()
  }

  private async run(): Promise<SandboxExecutionResult> {
    const started = Date.parse(this.input.startedAt)
    let workspace: MaterializedSandboxWorkspace | undefined
    let containerCreated = false
    let status: SandboxExecutionResult['status'] = 'internal-error'
    let stdout = ''
    let stderr = ''
    let exitCode: number | undefined
    let signal: string | undefined
    let outputTruncated = false
    let verificationLevel: VerificationLevel = 'UNVERIFIED'
    let artifacts: SandboxExecutionResult['artifacts'] = []
    const diagnostics: SandboxDiagnostic[] = []
    let cleanupAttempted = false
    let cleanupSucceeded = true
    const cleanupWarnings: string[] = []

    try {
      assertStrongContainerRunner(this.input.runner, this.input.image, this.input.engine)
      workspace = await materializeSandboxContainerWorkspace({
        executionId: this.input.executionId,
        request: this.input.request,
        limits: this.input.runner.limits,
        ...(this.input.stateRoot === undefined ? {} : { stateRoot: this.input.stateRoot }),
      })
      const entrypoint = containerEntrypoint(this.input.request, workspace.entrypoint)
      this.plan = buildSandboxContainerCommandPlan({
        image: { ...this.input.image, installed: true },
        engine: this.input.engine,
        hostWorkspacePath: workspace.inputDir,
        hostOutputPath: workspace.outputDir,
        containerName: managedContainerName(this.input.executionId),
        entrypoint,
        limits: this.input.runner.limits,
        user: this.input.runner.container!.user,
      })

      const imageInspection = await this.command(
        this.plan.commands.inspectImage,
        CONTROL_COMMAND_TIMEOUT_MS,
        CONTROL_COMMAND_OUTPUT_BYTES,
      )
      if (imageInspection.exitCode !== 0) {
        status = 'unavailable'
        stderr = boundedMessage(imageInspection.stderr || imageInspection.stdout)
        diagnostics.push({
          severity: 'error',
          message:
            'The digest-pinned sandbox image is not installed locally. Normal execution will not pull it.',
        })
        return this.finalResult({
          started,
          status,
          stdout,
          stderr,
          outputTruncated,
          verificationLevel,
          artifacts,
          diagnostics,
          cleanupAttempted,
          cleanupSucceeded,
          cleanupWarnings,
        })
      }
      if (!imageInspection.stdout.includes(this.input.image.digest!)) {
        status = 'policy-blocked'
        stderr = 'The locally installed image does not match the allowlisted digest.'
        diagnostics.push({ severity: 'error', message: stderr })
        return this.finalResult({
          started,
          status,
          stdout,
          stderr,
          outputTruncated,
          verificationLevel,
          artifacts,
          diagnostics,
          cleanupAttempted,
          cleanupSucceeded,
          cleanupWarnings,
        })
      }

      const created = await this.command(
        this.plan.commands.create,
        CONTROL_COMMAND_TIMEOUT_MS,
        CONTROL_COMMAND_OUTPUT_BYTES,
      )
      if (created.exitCode !== 0) throw commandFailure('container create', created)
      containerCreated = true

      const startedContainer = await this.command(
        this.plan.commands.start,
        CONTROL_COMMAND_TIMEOUT_MS,
        CONTROL_COMMAND_OUTPUT_BYTES,
      )
      if (startedContainer.exitCode !== 0) throw commandFailure('container start', startedContainer)

      const copiedIn = await this.command(
        this.plan.commands.copyIn,
        CONTROL_COMMAND_TIMEOUT_MS,
        CONTROL_COMMAND_OUTPUT_BYTES,
      )
      if (copiedIn.exitCode !== 0) throw commandFailure('container copy-in', copiedIn)

      const execution = await this.command(
        this.plan.commands.execute,
        executionTimeoutMs(this.input.request, this.input.runner),
        this.input.runner.limits.maxOutputBytes,
        this.input.request.stdin,
      )
      stdout = execution.stdout
      stderr = execution.stderr
      outputTruncated = execution.outputLimited
      exitCode = execution.exitCode ?? undefined
      signal = execution.signal
      if (execution.cancelled || this.cancelled) status = 'cancelled'
      else if (execution.timedOut) status = 'timeout'
      else if (execution.outputLimited) status = 'resource-limit'
      else if (execution.exitCode === 0) {
        status = 'passed'
        verificationLevel = verificationForMode(this.input.request.mode)
      } else if (
        execution.exitCode === 137 ||
        /(?:ENOSPC|no space left|out of memory|allocation failed)/i.test(stderr)
      ) {
        status = 'resource-limit'
      } else if (this.input.request.mode === 'compile') status = 'compile-error'
      else status = 'runtime-error'

      const copiedOut = await this.command(
        this.plan.commands.copyOut,
        CONTROL_COMMAND_TIMEOUT_MS,
        CONTROL_COMMAND_OUTPUT_BYTES,
      )
      if (copiedOut.exitCode !== 0) {
        diagnostics.push({
          severity: 'warning',
          message: `Artifact copy-out failed: ${boundedMessage(copiedOut.stderr || copiedOut.stdout)}`,
        })
      } else {
        const quarantine = await quarantineSandboxContainerArtifacts({
          executionId: this.input.executionId,
          workspace,
          limits: this.input.runner.limits,
        })
        artifacts = quarantine.artifacts
        diagnostics.push(
          ...quarantine.warnings.map((message) => ({ severity: 'warning' as const, message })),
        )
      }
    } catch (error) {
      if (this.cancelled) status = 'cancelled'
      else if (error instanceof SandboxWorkspaceBoundaryError) status = 'policy-blocked'
      else status = 'internal-error'
      const message = error instanceof Error ? error.message : String(error)
      stderr = stderr.length === 0 ? boundedMessage(message) : stderr
      diagnostics.push({ severity: 'error', message: boundedMessage(message) })
    } finally {
      cleanupAttempted = true
      if (containerCreated && this.plan !== undefined) {
        const removal = await runStandaloneCommand(
          this.plan.commands.remove,
          this.env,
          CONTROL_COMMAND_TIMEOUT_MS,
        )
        if (removal.exitCode !== 0) {
          cleanupSucceeded = false
          cleanupWarnings.push(
            `Container removal failed: ${boundedMessage(removal.stderr || removal.stdout)}`,
          )
        }
      }
      if (workspace !== undefined) {
        try {
          await cleanupSandboxContainerWorkspace(workspace)
        } catch (error) {
          cleanupSucceeded = false
          cleanupWarnings.push(
            `Temporary workspace cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }

    return this.finalResult({
      started,
      status,
      stdout,
      stderr,
      outputTruncated,
      verificationLevel,
      artifacts,
      diagnostics,
      cleanupAttempted,
      cleanupSucceeded,
      cleanupWarnings,
      ...(exitCode === undefined ? {} : { exitCode }),
      ...(signal === undefined ? {} : { signal }),
    })
  }

  private command(
    argv: readonly string[],
    timeoutMs: number,
    maxOutputBytes: number,
    stdin?: string,
  ): Promise<CommandOutcome> {
    return new Promise((resolve, reject) => {
      if (argv.length === 0) {
        reject(new Error('Container command argv must not be empty.'))
        return
      }
      const [command, ...args] = argv
      const child = spawn(command!, args, {
        shell: false,
        windowsHide: true,
        env: this.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      this.activeChild = child
      let stdout = Buffer.alloc(0)
      let stderr = Buffer.alloc(0)
      let outputLimited = false
      let timedOut = false
      let settled = false

      const append = (target: Buffer, chunk: Buffer): Buffer => {
        const remaining = Math.max(0, maxOutputBytes - stdout.byteLength - stderr.byteLength)
        if (remaining === 0) {
          outputLimited = true
          child.kill('SIGKILL')
          this.forceKillContainer()
          return target
        }
        if (chunk.byteLength > remaining) {
          outputLimited = true
          child.kill('SIGKILL')
          this.forceKillContainer()
          return Buffer.concat([target, chunk.subarray(0, remaining)])
        }
        return Buffer.concat([target, chunk])
      }

      child.stdout.on('data', (chunk: Buffer) => {
        stdout = append(stdout, chunk)
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = append(stderr, chunk)
      })
      child.once('error', (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.activeChild = undefined
        reject(error)
      })
      child.once('close', (code, closeSignal) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.activeChild = undefined
        resolve({
          exitCode: code,
          ...(closeSignal === null ? {} : { signal: closeSignal }),
          stdout: stdout.toString('utf8'),
          stderr: stderr.toString('utf8'),
          timedOut,
          cancelled: this.cancelled,
          outputLimited,
        })
      })
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
        this.forceKillContainer()
      }, timeoutMs)
      if (stdin !== undefined) child.stdin.end(stdin)
      else child.stdin.end()
    })
  }

  private forceKillContainer(): void {
    if (this.plan === undefined) return
    const [command, ...args] = this.plan.commands.kill
    const child = spawn(command!, args, {
      shell: false,
      windowsHide: true,
      env: this.env,
      stdio: 'ignore',
      detached: true,
    })
    child.unref()
  }

  private finalResult(options: {
    readonly started: number
    readonly status: SandboxExecutionResult['status']
    readonly stdout: string
    readonly stderr: string
    readonly outputTruncated: boolean
    readonly verificationLevel: VerificationLevel
    readonly artifacts: SandboxExecutionResult['artifacts']
    readonly diagnostics: readonly SandboxDiagnostic[]
    readonly cleanupAttempted: boolean
    readonly cleanupSucceeded: boolean
    readonly cleanupWarnings: readonly string[]
    readonly exitCode?: number
    readonly signal?: string
  }): SandboxExecutionResult {
    const completedAt = this.input.now().toISOString()
    return {
      executionId: this.input.executionId,
      languageId: this.input.request.languageId,
      runnerId: this.input.runner.id,
      trustClass: this.input.runner.trustClass,
      backend: this.input.runner.backend,
      status: options.status,
      startedAt: this.input.startedAt,
      completedAt,
      durationMs: Math.max(0, Date.parse(completedAt) - options.started),
      ...(options.exitCode === undefined ? {} : { exitCode: options.exitCode }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      stdout: options.stdout,
      stderr: options.stderr,
      outputTruncated: options.outputTruncated,
      diagnostics: options.diagnostics,
      artifacts: options.artifacts,
      evidence: {
        verificationLevel: options.verificationLevel,
        inputHash: sha256(JSON.stringify(this.input.request)),
        policyDecision: 'allowed',
      },
      cleanup: {
        attempted: options.cleanupAttempted,
        succeeded: options.cleanupSucceeded,
        ...(options.cleanupWarnings.length === 0
          ? {}
          : { warning: options.cleanupWarnings.join(' ') }),
      },
    }
  }
}

async function runStandaloneCommand(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<CommandOutcome> {
  return new Promise((resolve) => {
    if (argv.length === 0) {
      resolve({
        exitCode: 1,
        stdout: '',
        stderr: 'Empty command.',
        timedOut: false,
        cancelled: false,
        outputLimited: false,
      })
      return
    }
    const [command, ...args] = argv
    const child = spawn(command!, args, {
      shell: false,
      windowsHide: true,
      env: safeEngineEnvironment(env),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = Buffer.alloc(0)
    let stderr = Buffer.alloc(0)
    let timedOut = false
    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.byteLength < CONTROL_COMMAND_OUTPUT_BYTES) {
        stdout = Buffer.concat([
          stdout,
          chunk.subarray(0, CONTROL_COMMAND_OUTPUT_BYTES - stdout.byteLength),
        ])
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.byteLength < CONTROL_COMMAND_OUTPUT_BYTES) {
        stderr = Buffer.concat([
          stderr,
          chunk.subarray(0, CONTROL_COMMAND_OUTPUT_BYTES - stderr.byteLength),
        ])
      }
    })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.once('error', (error) => {
      clearTimeout(timer)
      resolve({
        exitCode: 1,
        stdout: stdout.toString('utf8'),
        stderr: error.message,
        timedOut,
        cancelled: false,
        outputLimited: false,
      })
    })
    child.once('close', (code, closeSignal) => {
      clearTimeout(timer)
      resolve({
        exitCode: code,
        ...(closeSignal === null ? {} : { signal: closeSignal }),
        stdout: stdout.toString('utf8'),
        stderr: stderr.toString('utf8'),
        timedOut,
        cancelled: false,
        outputLimited: false,
      })
    })
  })
}

function assertStrongContainerRunner(
  runner: SandboxRunnerDefinition,
  image: SandboxImageDefinition,
  engine: SandboxContainerEngineStatus,
): void {
  if (runner.backend !== 'container' || runner.trustClass !== 'container-isolated') {
    throw new Error('Strong container backend requires a container-isolated runner.')
  }
  if (runner.container === undefined) {
    throw new Error('Container runner is missing immutable engine and image configuration.')
  }
  if (engine.engine !== runner.container.engine || engine.status !== 'available') {
    throw new Error('The selected container engine is unavailable or differs from runner policy.')
  }
  if (
    image.id !== runner.container.imageId ||
    image.image !== runner.container.image ||
    image.digest !== runner.container.digest ||
    image.enabled !== true
  ) {
    throw new Error('The selected image does not match the immutable runner allowlist.')
  }
}

function containerEntrypoint(
  request: SandboxExecutionRequest,
  relativeEntrypoint: string,
): readonly string[] {
  const containerPath = path.posix.join('/workspace', relativeEntrypoint.replaceAll('\\', '/'))
  if (request.mode === 'compile') return ['node', '--check', containerPath]
  if (request.mode === 'test') return ['node', '--test', containerPath, ...(request.args ?? [])]
  return ['node', containerPath, ...(request.args ?? [])]
}

function executionTimeoutMs(
  request: SandboxExecutionRequest,
  runner: SandboxRunnerDefinition,
): number {
  return request.mode === 'compile' ? runner.limits.compileTimeoutMs : runner.limits.timeoutMs
}

function verificationForMode(mode: SandboxExecutionRequest['mode']): VerificationLevel {
  if (mode === 'compile') return 'COMPILED'
  if (mode === 'test') return 'TESTED'
  return 'EXECUTED'
}

function managedContainerName(executionId: string): string {
  const safe = executionId.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60)
  return `symbolwright-sandbox-${safe.length === 0 ? 'execution' : safe}`
}

function safeEngineEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = {}
  for (const key of [
    'PATH',
    'SystemRoot',
    'WINDIR',
    'DOCKER_HOST',
    'DOCKER_CONTEXT',
    'XDG_RUNTIME_DIR',
    'CONTAINER_HOST',
  ]) {
    const value = env[key]
    if (value !== undefined) safe[key] = value
  }
  return safe
}

function commandFailure(stage: string, outcome: CommandOutcome): Error {
  return new Error(
    `${stage} failed with status ${outcome.exitCode ?? 'unknown'}: ${boundedMessage(outcome.stderr || outcome.stdout)}`,
  )
}

function boundedMessage(value: string): string {
  const normalized = value.replace(/[\r\n\t]+/g, ' ').trim()
  return normalized.length <= 1_000 ? normalized : `${normalized.slice(0, 1_000)}…`
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
