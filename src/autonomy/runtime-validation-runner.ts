import {
  parsePortableValidationInvocation,
  resolvePortableValidationRoot,
} from '../portability/portable-validation-invocation.js'
import {
  DockerPortableValidationRunner,
  type PortableValidationRunner,
} from '../portability/portable-validation-runner.js'
import { isSafePortableValidationCommand } from '../portability/repository-portability.js'
import type { SandboxCommandWorkspaceTrust } from '../sandbox/sandbox-command-policy.js'
import type { SandboxAuthorizationContext } from '../sandbox/sandbox-policy-model.js'
import type { SandboxRunner } from '../runtime/sandbox/sandbox-runner.js'
import type { RuntimeApproval, RuntimePolicySnapshot } from '../runtime/types.js'
import { runValidationCommand } from '../runtime/validation/validation-command-executor.js'
import { ALLOWLISTED_VALIDATION_COMMANDS } from '../runtime/validation/validation-command-gate.js'
import type {
  AutonomousValidationResult,
  AutonomousValidationRunner,
} from './autonomous-repair-loop.js'

export interface RuntimeAutonomousValidationRunnerOptions {
  readonly policy: RuntimePolicySnapshot
  readonly approval?: RuntimeApproval | undefined
  readonly sandboxRunner?: SandboxRunner | undefined
  readonly portableRunner?: PortableValidationRunner | undefined
  readonly authorization?: SandboxAuthorizationContext | undefined
  readonly workspaceTrust?: SandboxCommandWorkspaceTrust | undefined
  readonly reason?: string | undefined
}

/**
 * Production adapter that executes every validation path through brokered sandbox adapters.
 * Legacy root-level Node commands retain the transcript pathway; discovered ecosystem and nested
 * package commands use server-owned portable command profiles.
 */
export class RuntimeAutonomousValidationRunner implements AutonomousValidationRunner {
  readonly #options: RuntimeAutonomousValidationRunnerOptions

  constructor(options: RuntimeAutonomousValidationRunnerOptions) {
    this.#options = options
  }

  async run(input: {
    readonly repositoryRoot: string
    readonly phase: string
    readonly command: string
  }): Promise<AutonomousValidationResult> {
    let invocation
    try {
      invocation = parsePortableValidationInvocation(input.command)
    } catch (error) {
      return {
        phase: input.phase,
        command: input.command,
        passed: false,
        exitCode: null,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        durationMs: 0,
      }
    }

    const isLegacyRootCommand =
      invocation.workingDirectory === '.' &&
      ALLOWLISTED_VALIDATION_COMMANDS.includes(
        invocation.command as (typeof ALLOWLISTED_VALIDATION_COMMANDS)[number],
      )
    const workspaceTrust = this.#options.workspaceTrust ?? 'trusted-local'

    if (!isLegacyRootCommand && isSafePortableValidationCommand(invocation.command)) {
      let repositoryRoot: string
      try {
        repositoryRoot = resolvePortableValidationRoot(
          input.repositoryRoot,
          invocation.workingDirectory,
        )
      } catch (error) {
        return {
          phase: input.phase,
          command: input.command,
          passed: false,
          exitCode: null,
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          durationMs: 0,
        }
      }
      const portableRunner =
        this.#options.portableRunner ??
        new DockerPortableValidationRunner({
          workspaceTrust,
          ...(this.#options.authorization === undefined
            ? {}
            : { authorization: this.#options.authorization }),
        })
      const result = await portableRunner.run({
        repositoryRoot,
        command: invocation.command,
        policy: this.#options.policy,
        workspaceTrust,
        ...(this.#options.authorization === undefined
          ? {}
          : { authorization: this.#options.authorization }),
      })
      return {
        phase: input.phase,
        command: input.command,
        passed: result.outcome === 'PASS',
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr || result.reason || '',
        durationMs: result.durationMs,
      }
    }

    const result = await runValidationCommand(
      invocation.command,
      this.#options.reason ?? `Autonomous repair validation phase ${input.phase}`,
      false,
      input.repositoryRoot,
      this.#options.policy,
      this.#options.approval,
      this.#options.sandboxRunner,
      this.#options.authorization,
      workspaceTrust,
    )

    return {
      phase: input.phase,
      command: input.command,
      passed: result.outcome === 'PASS',
      exitCode: result.exitCode,
      stdout: result.redactedStdout,
      stderr: result.redactedStderr,
      durationMs: result.elapsedMs,
    }
  }
}
