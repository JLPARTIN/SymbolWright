import { assertValidPolicy } from '../policy/runtime-policy.js'
import { isValidApprovalScope } from '../types.js'
import type { RuntimeToolContext } from '../types.js'

export function assertValidToolContext(context: unknown): asserts context is RuntimeToolContext {
  if (typeof context !== 'object' || context === null) {
    throw new Error('RuntimeToolContext must be a non-null object')
  }

  const ctx = context as Record<string, unknown>

  if (typeof ctx['cwd'] !== 'string' || (ctx['cwd'] as string).trim().length === 0) {
    throw new Error('RuntimeToolContext.cwd must be a non-empty string')
  }

  assertValidPolicy(ctx['policy'])

  if (ctx['approval'] !== undefined) {
    const approval = ctx['approval'] as Record<string, unknown>

    if (typeof approval['ticketId'] !== 'string' || (approval['ticketId'] as string).trim().length === 0) {
      throw new Error('RuntimeApproval.ticketId must be a non-empty string')
    }

    if (typeof approval['approvedBy'] !== 'string' || (approval['approvedBy'] as string).trim().length === 0) {
      throw new Error('RuntimeApproval.approvedBy must be a non-empty string')
    }

    if (!Array.isArray(approval['scopes'])) {
      throw new Error('RuntimeApproval.scopes must be an array')
    }

    for (const scope of approval['scopes'] as unknown[]) {
      if (typeof scope !== 'string' || !isValidApprovalScope(scope)) {
        throw new Error(`Invalid approval scope: ${String(scope)}`)
      }
    }
  }
}
