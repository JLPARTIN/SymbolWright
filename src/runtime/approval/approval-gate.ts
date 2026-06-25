import path from 'node:path'

import { assertReadablePath, isPathInsideWorkspace, resolveWorkspacePath } from '../policy/runtime-policy.js'
import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'

export interface ApprovalGateInput {
  readonly approval?: RuntimeApproval
  readonly requiredScope: string
  readonly workspaceRoot: string
  readonly targetPath?: string
  readonly policy: RuntimePolicySnapshot
}

export function assertApprovalGate(input: ApprovalGateInput): void {
  if (input.approval === undefined) {
    throw new Error('Approved execution requires an approval ticket.')
  }

  if (!input.approval.scopes.includes(input.requiredScope)) {
    throw new Error(`Approval ticket is missing required scope: ${input.requiredScope}`)
  }

  if (input.targetPath !== undefined) {
    const resolvedPath = resolveWorkspacePath(input.workspaceRoot, input.targetPath)
    if (!isPathInsideWorkspace(input.workspaceRoot, resolvedPath)) {
      throw new Error(`Approved execution blocked outside workspace: ${input.targetPath}`)
    }

    assertReadablePath(input.policy, input.workspaceRoot, resolvedPath)
  }
}

export function formatApprovalSummary(approval: RuntimeApproval): string {
  return [
    `Ticket: ${approval.ticketId}`,
    `Approved by: ${approval.approvedBy}`,
    `Scopes: ${approval.scopes.join(', ')}`,
  ].join('\n')
}

export function toWorkspaceRelativePath(workspaceRoot: string, targetPath: string): string {
  return path.relative(path.resolve(workspaceRoot), resolveWorkspacePath(workspaceRoot, targetPath))
}
