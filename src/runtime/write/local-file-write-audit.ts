import { createAuditEvent, type RuntimeAuditEvent } from '../audit/runtime-audit-log.js'
import type { RuntimeApproval } from '../types.js'
import type { LocalFileWriteGateResult } from './local-file-write-gate.js'
import type { LocalFileWriteExecutionResult } from './local-file-write-result.js'

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
    return approval !== undefined ? createAuditEvent({ ...base, approval }) : createAuditEvent(base)
  }

  const detail = result.dryRun
    ? `Dry-run write to ${result.targetPath}: ${result.reason}`
    : `Write to ${result.targetPath}: ${result.reason}`

  const base = {
    action: 'local_file_write',
    status: 'allowed' as const,
    detail,
  }
  return approval !== undefined ? createAuditEvent({ ...base, approval }) : createAuditEvent(base)
}

export function createLocalFileWriteExecutionAuditEvent(
  execResult: LocalFileWriteExecutionResult,
  approval: RuntimeApproval | undefined,
): RuntimeAuditEvent {
  if (execResult.outcome === 'BLOCKED') {
    const blockDetail =
      execResult.error !== null
        ? `Write to ${execResult.gateResult.targetPath} failed: ${execResult.error}`
        : `Write to ${execResult.gateResult.targetPath} blocked: ${execResult.gateResult.blockReasons.join('; ')}`
    const base = {
      action: 'local_file_write_execution',
      status: 'blocked' as const,
      detail: blockDetail,
    }
    return approval !== undefined ? createAuditEvent({ ...base, approval }) : createAuditEvent(base)
  }

  if (execResult.outcome === 'DRY_RUN') {
    const base = {
      action: 'local_file_write_execution',
      status: 'allowed' as const,
      detail: `Dry-run write to ${execResult.gateResult.targetPath}: ${execResult.gateResult.reason}`,
    }
    return approval !== undefined ? createAuditEvent({ ...base, approval }) : createAuditEvent(base)
  }

  const fileAction = execResult.diff?.isNew ? 'Created' : 'Updated'
  const base = {
    action: 'local_file_write_execution',
    status: 'allowed' as const,
    detail: `${fileAction} ${execResult.gateResult.targetPath}: ${execResult.gateResult.reason}`,
  }
  return approval !== undefined ? createAuditEvent({ ...base, approval }) : createAuditEvent(base)
}
