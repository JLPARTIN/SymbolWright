import path from 'node:path'

import { assertReadablePath, isPathInsideWorkspace, resolveWorkspacePath } from '../policy/runtime-policy.js'
import type { RuntimeApproval, RuntimeApprovalScope, RuntimePolicySnapshot } from '../types.js'

/** Input for an approval gate check — scope, workspace, target path, and policy. */
export interface ApprovalGateInput {
  readonly approval?: RuntimeApproval
  readonly requiredScope: RuntimeApprovalScope
  readonly workspaceRoot: string
  readonly targetPath?: string
  readonly policy: RuntimePolicySnapshot
}

/** Throws if approval is missing, scope is insufficient, or path is protected. */
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

/** Renders a human-readable summary of an approval ticket. */
export function formatApprovalSummary(approval: RuntimeApproval): string {
  return [
    `Ticket: ${approval.ticketId}`,
    `Approved by: ${approval.approvedBy}`,
    `Scopes: ${approval.scopes.join(', ')}`,
  ].join('\n')
}

/** Converts a target path to a workspace-relative path string. */
export function toWorkspaceRelativePath(workspaceRoot: string, targetPath: string): string {
  return path.relative(path.resolve(workspaceRoot), resolveWorkspacePath(workspaceRoot, targetPath))
}
