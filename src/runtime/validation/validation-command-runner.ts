import { spawnSync } from 'node:child_process'

import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import {
  evaluateValidationCommandGate,
  type ValidationCommandGateResult,
  type ValidationCommandRequest,
} from './validation-command-gate.js'

export type ValidationCommandExecutionOutcome = 'BLOCKED' | 'DRY_RUN' | 'EXECUTED'

export interface ValidationCommandExecutionResult {
  readonly outcome: ValidationCommandExecutionOutcome
  readonly gateResult: ValidationCommandGateResult
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
  readonly error: string | null
}

const MAX_OUTPUT_LENGTH = 8_000
const VALIDATION_TIMEOUT_MS = 120_000

function sanitizeOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_LENGTH) {
    return output
  }

  return `${output.slice(0, MAX_OUTPUT_LENGTH)}\n[output truncated]`
}

function commandToArgs(command: string): readonly string[] {
  return command.split(' ')
}

export function executeValidationCommand(
  request: ValidationCommandRequest,
  cwd: string,
  policy: RuntimePolicySnapshot,
  approval: RuntimeApproval | undefined,
): ValidationCommandExecutionResult {
  const gateResult = evaluateValidationCommandGate(request, policy, approval)

  if (gateResult.decision === 'BLOCKED') {
    return {
      outcome: 'BLOCKED',
      gateResult,
      exitCode: null,
      stdout: '',
      stderr: '',
      error: null,
    }
  }

  if (gateResult.dryRun) {
    return {
      outcome: 'DRY_RUN',
      gateResult,
      exitCode: null,
      stdout: '',
      stderr: '',
      error: null,
    }
  }

  const [command, ...args] = commandToArgs(gateResult.command)

  if (command === undefined) {
    return {
      outcome: 'BLOCKED',
      gateResult,
      exitCode: null,
      stdout: '',
      stderr: '',
      error: 'Validation command resolved to an empty executable.',
    }
  }

  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    timeout: VALIDATION_TIMEOUT_MS,
    env: {
      PATH: process.env['PATH'] ?? '',
      NODE_ENV: process.env['NODE_ENV'] ?? 'test',
      npm_config_cache: process.env['npm_config_cache'] ?? '',
    },
  })

  return {
    outcome: 'EXECUTED',
    gateResult,
    exitCode: typeof result.status === 'number' ? result.status : null,
    stdout: sanitizeOutput(result.stdout ?? ''),
    stderr: sanitizeOutput(result.stderr ?? ''),
    error: result.error instanceof Error ? result.error.message : null,
  }
}

export function renderValidationCommandExecutionResult(
  result: ValidationCommandExecutionResult,
): string {
  const sections: string[] = [
    'CodeMind validation command execution',
    '',
    `Outcome: ${result.outcome}`,
    `Command: ${result.gateResult.command}`,
    `Reason: ${result.gateResult.reason}`,
    `Exit code: ${result.exitCode === null ? 'not run' : String(result.exitCode)}`,
  ]

  if (result.gateResult.blockReasons.length > 0) {
    sections.push('', 'Block reasons:')
    sections.push(...result.gateResult.blockReasons.map((reason) => `- ${reason}`))
  }

  if (result.outcome === 'DRY_RUN') {
    sections.push('', 'Dry-run only. No command has been executed.')
  }

  if (result.outcome === 'EXECUTED') {
    sections.push('', 'Approved validation command executed.')
  }

  if (result.stdout.length > 0) {
    sections.push('', 'stdout:', result.stdout)
  }

  if (result.stderr.length > 0) {
    sections.push('', 'stderr:', result.stderr)
  }

  if (result.error !== null) {
    sections.push('', `Error: ${result.error}`)
  }

  return sections.join('\n')
}
