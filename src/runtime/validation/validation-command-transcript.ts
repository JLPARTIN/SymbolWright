import type { ValidationExecutorOutcome } from './validation-command-executor.js'

export interface ValidationCommandTranscript {
  readonly command: string
  readonly reason: string
  readonly dryRun: boolean
  readonly outcome: ValidationExecutorOutcome
  readonly exitCode: number | null
  readonly redactedStdout: string
  readonly redactedStderr: string
  readonly elapsedMs: number
  readonly blockReasons: readonly string[]
  readonly recordedAt: string
}

export interface ValidationCommandTranscriptInput {
  readonly command: string
  readonly reason: string
  readonly dryRun: boolean
  readonly outcome: ValidationExecutorOutcome
  readonly exitCode: number | null
  readonly redactedStdout: string
  readonly redactedStderr: string
  readonly elapsedMs: number
  readonly blockReasons: readonly string[]
}

export function createValidationTranscript(
  input: ValidationCommandTranscriptInput,
): ValidationCommandTranscript {
  return {
    ...input,
    recordedAt: new Date().toISOString(),
  }
}

export function renderValidationTranscript(transcript: ValidationCommandTranscript): string {
  const lines = [
    'Validation Command Transcript',
    '',
    `Command: ${transcript.command}`,
    `Reason: ${transcript.reason}`,
    `Outcome: ${transcript.outcome}`,
    `Exit code: ${transcript.exitCode === null ? 'not run' : String(transcript.exitCode)}`,
    `Elapsed: ${transcript.elapsedMs}ms`,
    `Dry run: ${transcript.dryRun ? 'yes' : 'no'}`,
    `Recorded: ${transcript.recordedAt}`,
  ]

  if (transcript.blockReasons.length > 0) {
    lines.push('', 'Block reasons:')
    for (const reason of transcript.blockReasons) {
      lines.push(`  - ${reason}`)
    }
  }

  return lines.join('\n')
}
