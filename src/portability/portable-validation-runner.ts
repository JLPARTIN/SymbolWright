import {
  DockerSandboxRunner,
  type SandboxCommandBinary,
  type SandboxRunner,
} from '../sandbox/sandbox-command-backend.js'
import {
  getSandboxCommandProfile,
  parseSandboxCommand,
  type SandboxCommandProfileId,
  type SandboxCommandWorkspaceTrust,
} from '../sandbox/sandbox-command-policy.js'
import type { SandboxAuthorizationContext } from '../sandbox/sandbox-policy-model.js'
import type { RuntimePolicySnapshot } from '../runtime/types.js'
import { isSafePortableValidationCommand } from './repository-portability.js'

export interface PortableValidationRequest {
  readonly repositoryRoot: string
  readonly command: string
  readonly policy: RuntimePolicySnapshot
  readonly timeoutMs?: number
  readonly maxOutputBytes?: number
  readonly authorization?: SandboxAuthorizationContext
  readonly workspaceTrust?: SandboxCommandWorkspaceTrust
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

export interface DockerPortableValidationRunnerOptions {
  readonly sandboxRunner?: SandboxRunner
  readonly authorization?: SandboxAuthorizationContext
  readonly workspaceTrust?: SandboxCommandWorkspaceTrust
}

export class DockerPortableValidationRunner implements PortableValidationRunner {
  readonly #options: DockerPortableValidationRunnerOptions

  constructor(options: DockerPortableValidationRunnerOptions = {}) {
    this.#options = options
  }

  async run(request: PortableValidationRequest): Promise<PortableValidationResult> {
    const startedAt = Date.now()
    const command = request.command.trim()
    const profileId = commandProfileForPortableValidation(command)
    const image = getSandboxCommandProfile(profileId)?.image ?? 'unavailable'
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

    let parsed
    try {
      parsed = parseSandboxCommand(command)
    } catch (error) {
      return blocked(
        command,
        image,
        startedAt,
        error instanceof Error ? error.message : String(error),
      )
    }

    const runner = this.#options.sandboxRunner ?? new DockerSandboxRunner()
    const authorization = request.authorization ?? this.#options.authorization
    const result = await runner.runCommand({
      workspaceRoot: request.repositoryRoot,
      binary: parsed.binary as SandboxCommandBinary,
      args: parsed.args,
      profileId,
      workspaceTrust: request.workspaceTrust ?? this.#options.workspaceTrust ?? 'trusted-local',
      ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
      ...(request.maxOutputBytes === undefined ? {} : { maxOutputBytes: request.maxOutputBytes }),
      ...(authorization === undefined ? {} : { authorization }),
    })

    if (result.outcome === 'BLOCKED') {
      const backendError = result.reasonCode === 'SANDBOX_COMMAND_BACKEND_UNAVAILABLE'
      return {
        outcome: backendError ? 'ERROR' : 'BLOCKED',
        command,
        image,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: Date.now() - startedAt,
        reason: result.reason ?? 'Portable sandbox execution was blocked.',
      }
    }

    return {
      outcome: result.exitCode === 0 ? 'PASS' : 'FAIL',
      command,
      image,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: Date.now() - startedAt,
    }
  }
}

export function commandProfileForPortableValidation(command: string): SandboxCommandProfileId {
  const trimmed = command.trim()
  if (/^(npm|npx|node|prettier)\b/.test(trimmed)) return 'trusted-local-portable-node'
  if (/^(python|python3|pytest)\b/.test(trimmed)) return 'trusted-local-portable-python'
  if (/^(go|gofmt)\b/.test(trimmed)) return 'trusted-local-portable-go'
  if (/^(cargo|rustc)\b/.test(trimmed)) return 'trusted-local-portable-rust'
  if (/^(mvn|\.\/mvnw)\b/.test(trimmed)) return 'trusted-local-portable-maven'
  if (/^(gradle|\.\/gradlew)\b/.test(trimmed)) return 'trusted-local-portable-gradle'
  if (/^dotnet\b/.test(trimmed)) return 'trusted-local-portable-dotnet'
  if (/^(ruby|bundle|rake)\b/.test(trimmed)) return 'trusted-local-portable-ruby'
  if (/^(php|composer)\b/.test(trimmed)) return 'trusted-local-portable-php'
  return 'trusted-local-portable-node'
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
