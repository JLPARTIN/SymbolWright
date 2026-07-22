import type { SandboxRunner } from '../runtime/sandbox/sandbox-runner.js'
import type { RuntimeApproval, RuntimePolicySnapshot } from '../runtime/types.js'
import { runValidationCommand } from '../runtime/validation/validation-command-executor.js'
import type {
  AutonomousValidationResult,
  AutonomousValidationRunner,
} from './autonomous-repair-loop.js'

export interface RuntimeAutonomousValidationRunnerOptions {
  readonly policy: RuntimePolicySnapshot
  readonly approval?: RuntimeApproval | undefined
  readonly sandboxRunner?: SandboxRunner | undefined
  readonly reason?: string | undefined
}

/**
 * Production adapter that executes repair-loop validation through CodeMind's
 * existing policy, approval, redaction, transcript, and sandbox pathway.
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
