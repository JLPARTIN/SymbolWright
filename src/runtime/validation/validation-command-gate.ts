import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'

export const ALLOWLISTED_VALIDATION_COMMANDS = [
  'npm run typecheck',
  'npm test',
  'npm run test:coverage',
  'npm run lint',
  'npm run audit',
  'npm run build',
  'npm run build:app',
] as const

export type AllowlistedValidationCommand = (typeof ALLOWLISTED_VALIDATION_COMMANDS)[number]

export interface ValidationCommandRequest {
  readonly command: string
  readonly reason: string
  readonly dryRun: boolean
}

export type ValidationCommandDecision = 'ALLOWED' | 'BLOCKED'

export interface ValidationCommandGateResult {
  readonly decision: ValidationCommandDecision
  readonly command: string
  readonly reason: string
  readonly dryRun: boolean
  readonly blockReasons: readonly string[]
}

export function evaluateValidationCommandGate(
  request: ValidationCommandRequest,
  policy: RuntimePolicySnapshot,
  approval: RuntimeApproval | undefined,
): ValidationCommandGateResult {
  void approval

  const blockReasons: string[] = []
  const command = request.command.trim()

  if (!policy.allowShell) {
    blockReasons.push('Shell execution is disabled by runtime policy.')
  }

  if (command.length === 0) {
    blockReasons.push('Validation command must not be empty.')
  } else if (!ALLOWLISTED_VALIDATION_COMMANDS.includes(command as AllowlistedValidationCommand)) {
    blockReasons.push(`Command is not allowlisted: ${command}`)
  }

  if (request.reason.trim().length === 0) {
    blockReasons.push('Validation command request must include a reason.')
  }

  return {
    decision: blockReasons.length === 0 ? 'ALLOWED' : 'BLOCKED',
    command,
    reason: request.reason,
    dryRun: request.dryRun,
    blockReasons,
  }
}

export function renderValidationCommandGateResult(result: ValidationCommandGateResult): string {
  const sections: string[] = [
    'CodeMind validation command gate',
    '',
    `Decision: ${result.decision}`,
    `Command: ${result.command}`,
    `Dry run: ${result.dryRun ? 'yes' : 'no'}`,
    `Reason: ${result.reason}`,
  ]

  if (result.blockReasons.length > 0) {
    sections.push('', 'Block reasons:')
    sections.push(...result.blockReasons.map((reason) => `- ${reason}`))
  }

  if (result.decision === 'ALLOWED' && result.dryRun) {
    sections.push('', 'Dry-run preview: command would be allowed.', 'No command has been executed.')
  }

  if (result.decision === 'ALLOWED' && !result.dryRun) {
    sections.push(
      '',
      'Command is allowed by runtime policy.',
      'Note: This gate evaluates permission only. No command is executed by this tool.',
    )
  }

  return sections.join('\n')
}
