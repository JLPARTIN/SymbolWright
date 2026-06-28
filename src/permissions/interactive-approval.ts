import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

import { evaluateCodemindPermissionRequest } from './codemind-permission-policy.js'
import type {
  CodemindPermissionRequest,
  CodemindPermissionDecision,
} from './codemind-permission.types.js'

export interface InteractiveApprovalOptions {
  readonly autoApprove?: boolean
  readonly interactive?: boolean
}

export async function promptForApproval(
  toolName: string,
  description: string,
  options: InteractiveApprovalOptions = {},
): Promise<boolean> {
  if (options.autoApprove === true) return true
  if (options.interactive === false) return false

  const rl = createInterface({ input: stdin, output: stdout })
  try {
    const answer = await rl.question(
      `\x1b[33m[${toolName}]\x1b[0m ${description}\n  Allow? (y/n): `,
    )
    return answer.trim().toLowerCase() === 'y'
  } catch {
    return false
  } finally {
    rl.close()
  }
}

export function evaluateAndCheck(request: CodemindPermissionRequest): CodemindPermissionDecision {
  return evaluateCodemindPermissionRequest(request)
}

export function shouldPromptUser(decision: CodemindPermissionDecision): boolean {
  return decision.disposition === 'ASK'
}

export function isBlocked(decision: CodemindPermissionDecision): boolean {
  return decision.disposition === 'DENY'
}
