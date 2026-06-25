import { createAuditEvent, type RuntimeAuditEvent } from '../audit/runtime-audit-log.js'
import type { GitHubWriteProposalResult } from './github-write-proposal.js'

export function createGitHubWriteProposalAuditEvent(
  result: GitHubWriteProposalResult,
): RuntimeAuditEvent {
  if (result.decision === 'BLOCKED') {
    return createAuditEvent({
      action: 'github_write_proposal',
      status: 'blocked',
      detail: `GitHub write "${result.action}" on ${result.repository} blocked: ${result.blockReasons.join('; ')}`,
    })
  }

  return createAuditEvent({
    action: 'github_write_proposal',
    status: 'allowed',
    detail: `GitHub write "${result.action}" proposed on ${result.repository} ref ${result.targetRef}: ${result.reason}`,
  })
}
