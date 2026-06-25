import { createAuditEvent, type RuntimeAuditEvent } from '../audit/runtime-audit-log.js'
import type { PrPreparationResult } from './pr-preparation.js'

export function createPrPreparationAuditEvent(
  result: PrPreparationResult,
): RuntimeAuditEvent {
  if (result.decision === 'INCOMPLETE') {
    return createAuditEvent({
      action: 'pr_preparation',
      status: 'blocked',
      detail: `PR "${result.title}" incomplete: ${result.issues.join('; ')}`,
    })
  }

  return createAuditEvent({
    action: 'pr_preparation',
    status: 'allowed',
    detail: `PR "${result.title}" ready for review (${result.changedFiles.length} files, ${result.baseBranch} <- ${result.headBranch})`,
  })
}
