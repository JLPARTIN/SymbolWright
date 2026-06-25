import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import {
  evaluateValidationCommandGate,
  renderValidationCommandGateResult,
  type ValidationCommandRequest,
} from '../validation/validation-command-gate.js'
import { createValidationCommandAuditEvent } from '../validation/validation-command-audit.js'
import { renderAuditEvents } from '../audit/runtime-audit-log.js'

export interface ValidationCommandGateToolInput {
  readonly command: string
  readonly reason: string
  readonly dryRun: boolean
}

function parseValidationCommandGateToolInput(input: unknown): ValidationCommandGateToolInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing validation command gate input.')
  }

  const obj = input as Record<string, unknown>
  const command = obj['command']
  const reason = obj['reason']
  const dryRun = obj['dryRun']

  if (typeof command !== 'string' || command.trim().length === 0) {
    throw new Error('Missing command.')
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new Error('Missing reason.')
  }

  return {
    command,
    reason,
    dryRun: typeof dryRun === 'boolean' ? dryRun : true,
  }
}

export const validationCommandGateTool: RuntimeToolDefinition = {
  name: 'validation_command_gate',
  description: 'Evaluate an approved validation command through the allowlisted command gate.',
  capability: 'VALIDATION_COMMAND',
  execute: async (input: unknown, context: RuntimeToolContext): Promise<string> => {
    const parsed = parseValidationCommandGateToolInput(input)

    const request: ValidationCommandRequest = {
      command: parsed.command,
      reason: parsed.reason,
      dryRun: parsed.dryRun,
    }

    const result = evaluateValidationCommandGate(request, context.policy, context.approval)
    const gateOutput = renderValidationCommandGateResult(result)
    const auditEvent = createValidationCommandAuditEvent(result, context.approval)
    const auditOutput = renderAuditEvents([auditEvent])

    return [gateOutput, '', '---', '', auditOutput].join('\n')
  },
}
