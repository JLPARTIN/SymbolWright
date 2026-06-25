import { createAuditEvent, type RuntimeAuditEvent } from '../audit/runtime-audit-log.js'
import type { RuntimeApproval } from '../types.js'
import type { LocalFileWriteGateResult } from './local-file-write-gate.js'

export function createLocalFileWriteAuditEvent(
  result: LocalFileWriteGateResult,
  approval: RuntimeApproval | undefined,
): RuntimeAuditEvent {
  if (result.decision === 'BLOCKED') {
    const base = {
      action: 'local_file_write',
      status: 'blocked' as const,
      detail: `Write to ${result.targetPath} blocked: ${result.blockReasons.join('; ')}`,
    }
    return approval !== undefined
      ? createAuditEvent({ ...base, approval })
      : createAuditEvent(base)
  }

  const detail = result.dryRun
    ? `Dry-run write to ${result.targetPath}: ${result.reason}`
    : `Applied write to ${result.targetPath}: ${result.reason}`

  const base = {
    action: 'local_file_write',
    status: 'allowed' as const,
    detail,
  }
  return approval !== undefined
    ? createAuditEvent({ ...base, approval })
    : createAuditEvent(base)
}
