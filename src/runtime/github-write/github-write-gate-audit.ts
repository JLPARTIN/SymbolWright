import { createAuditEvent, type RuntimeAuditEvent } from '../audit/runtime-audit-log.js'
import type { RuntimeApproval } from '../types.js'
import type { GitHubWriteGateResult } from './github-write-gate.js'

export function createGitHubWriteGateAuditEvent(
  result: GitHubWriteGateResult,
  approval: RuntimeApproval | undefined,
): RuntimeAuditEvent {
  if (result.decision === 'BLOCKED') {
    const base = {
      action: 'github_write_gate',
      status: 'blocked' as const,
      detail: `GitHub write "${result.action}" on ${result.repository} blocked: ${result.blockReasons.join('; ')}`,
    }
    return approval !== undefined ? createAuditEvent({ ...base, approval }) : createAuditEvent(base)
  }

  const detail = result.dryRun
    ? `Dry-run GitHub write "${result.action}" on ${result.repository} ref ${result.targetRef}: ${result.reason}`
    : `GitHub write "${result.action}" on ${result.repository} ref ${result.targetRef} allowed: ${result.reason}`

  const base = {
    action: 'github_write_gate',
    status: 'allowed' as const,
    detail,
  }
  return approval !== undefined ? createAuditEvent({ ...base, approval }) : createAuditEvent(base)
}
