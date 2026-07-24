import {
  DockerPortableValidationRunner,
  type PortableValidationRunner,
} from '../portability/portable-validation-runner.js'
import { isSafePortableValidationCommand } from '../portability/repository-portability.js'
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
  readonly reason?: string | undefined
}

/**
 * Production adapter that executes validation through CodeMind's policy gate.
 * Legacy Node commands retain the original transcript pathway; discovered
 * ecosystem commands use an isolated image selected from the portability profile.
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
    if (
      !ALLOWLISTED_VALIDATION_COMMANDS.includes(
        input.command as (typeof ALLOWLISTED_VALIDATION_COMMANDS)[number],
      ) &&
      isSafePortableValidationCommand(input.command)
    ) {
      const result = await (
        this.#options.portableRunner ?? new DockerPortableValidationRunner()
      ).run({
        repositoryRoot: input.repositoryRoot,
        command: input.command,
        policy: this.#options.policy,
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
      input.command,
      this.#options.reason ?? `Autonomous repair validation phase ${input.phase}`,
      false,
      input.repositoryRoot,
      this.#options.policy,
      this.#options.approval,
      this.#options.sandboxRunner,
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
