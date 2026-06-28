import { createAuditEvent, type RuntimeAuditEvent } from '../audit/runtime-audit-log.js'
import type { RuntimeApproval } from '../types.js'
import type { ValidationCommandGateResult } from './validation-command-gate.js'

export function createValidationCommandAuditEvent(
  result: ValidationCommandGateResult,
  approval: RuntimeApproval | undefined,
): RuntimeAuditEvent {
  if (result.decision === 'BLOCKED') {
    const base = {
      action: 'validation_command',
      status: 'blocked' as const,
      detail: `Command "${result.command}" blocked: ${result.blockReasons.join('; ')}`,
    }
    return approval !== undefined ? createAuditEvent({ ...base, approval }) : createAuditEvent(base)
  }

  const detail = result.dryRun
    ? `Dry-run command "${result.command}": ${result.reason}`
    : `Command "${result.command}" allowed: ${result.reason}`

  const base = {
    action: 'validation_command',
    status: 'allowed' as const,
    detail,
  }
  return approval !== undefined ? createAuditEvent({ ...base, approval }) : createAuditEvent(base)
}
