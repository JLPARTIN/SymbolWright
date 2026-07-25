import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import type { SandboxRunner } from '../sandbox/sandbox-runner.js'
import {
  executeValidationCommand,
  type ValidationCommandExecutionResult,
} from './validation-command-runner.js'
import { redactValidationOutput } from './validation-output-redactor.js'
import {
  createValidationTranscript,
  type ValidationCommandTranscript,
} from './validation-command-transcript.js'

export type ValidationExecutorOutcome = 'BLOCKED' | 'DRY_RUN' | 'PASS' | 'FAIL' | 'ERROR'

export interface ValidationExecutorResult {
  readonly outcome: ValidationExecutorOutcome
  readonly command: string
  readonly exitCode: number | null
  readonly redactedStdout: string
  readonly redactedStderr: string
  readonly elapsedMs: number
  readonly transcript: ValidationCommandTranscript
  readonly recommendedNextAction: string
}

function deriveOutcome(result: ValidationCommandExecutionResult): ValidationExecutorOutcome {
  if (result.outcome === 'BLOCKED') return 'BLOCKED'
  if (result.outcome === 'DRY_RUN') return 'DRY_RUN'
  if (result.error !== null) return 'ERROR'
  if (result.exitCode === 0) return 'PASS'
  return 'FAIL'
}

function deriveRecommendedNextAction(outcome: ValidationExecutorOutcome, command: string): string {
  switch (outcome) {
    case 'BLOCKED':
      return 'Resolve block reasons before retrying.'
    case 'DRY_RUN':
      return 'Set dryRun=false with approval to execute.'
    case 'PASS':
      return 'Validation passed. Proceed to next step.'
    case 'FAIL':
      return `Fix issues reported by "${command}" and re-run.`
    case 'ERROR':
      return `Investigate execution error for "${command}".`
  }
}

export async function runValidationCommand(
  command: string,
  reason: string,
  dryRun: boolean,
  cwd: string,
  policy: RuntimePolicySnapshot,
  approval: RuntimeApproval | undefined,
  sandboxRunner?: SandboxRunner,
): Promise<ValidationExecutorResult> {
  const startMs = Date.now()

  const result = await executeValidationCommand(
    { command, reason, dryRun },
    cwd,
    policy,
    approval,
    sandboxRunner,
  )

  const elapsedMs = Date.now() - startMs
  const outcome = deriveOutcome(result)

  const redactedStdout = redactValidationOutput(result.stdout)
  const redactedStderr = redactValidationOutput(result.stderr)

  const transcript = createValidationTranscript({
    command,
    reason,
    dryRun,
    outcome,
    exitCode: result.exitCode,
    redactedStdout,
    redactedStderr,
    elapsedMs,
    blockReasons: result.gateResult.blockReasons,
  })

  return {
    outcome,
    command,
    exitCode: result.exitCode,
    redactedStdout,
    redactedStderr,
    elapsedMs,
    transcript,
    recommendedNextAction: deriveRecommendedNextAction(outcome, command),
  }
}

export function renderValidationExecutorResult(result: ValidationExecutorResult): string {
  const lines = [
    'SymbolWright Validation Command Executor',
    '',
    `Outcome: ${result.outcome}`,
    `Command: ${result.command}`,
    `Exit code: ${result.exitCode === null ? 'not run' : String(result.exitCode)}`,
    `Elapsed: ${result.elapsedMs}ms`,
    `Recommended: ${result.recommendedNextAction}`,
  ]

  if (result.transcript.blockReasons.length > 0) {
    lines.push('', 'Block reasons:')
    for (const reason of result.transcript.blockReasons) {
      lines.push(`- ${reason}`)
    }
  }

  if (result.redactedStdout.length > 0) {
    lines.push('', 'stdout (redacted):', result.redactedStdout)
  }

  if (result.redactedStderr.length > 0) {
    lines.push('', 'stderr (redacted):', result.redactedStderr)
  }

  return lines.join('\n')
}
