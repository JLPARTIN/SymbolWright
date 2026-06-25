import path from 'node:path'

import { isPathInsideWorkspace, assertReadablePath } from '../policy/runtime-policy.js'
import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'

export interface LocalFileWriteRequest {
  readonly targetPath: string
  readonly content: string
  readonly reason: string
  readonly rollbackNote: string
  readonly dryRun: boolean
}

export type LocalFileWriteDecision = 'ALLOWED' | 'BLOCKED'

export interface LocalFileWriteGateResult {
  readonly decision: LocalFileWriteDecision
  readonly targetPath: string
  readonly resolvedPath: string
  readonly reason: string
  readonly rollbackNote: string
  readonly dryRun: boolean
  readonly blockReasons: readonly string[]
}

export function evaluateLocalFileWriteGate(
  request: LocalFileWriteRequest,
  workspaceRoot: string,
  policy: RuntimePolicySnapshot,
  approval: RuntimeApproval | undefined,
): LocalFileWriteGateResult {
  const blockReasons: string[] = []
  const root = path.resolve(workspaceRoot)
  const resolved = path.resolve(root, request.targetPath)

  if (!policy.allowWrites) {
    blockReasons.push('Write actions are disabled by runtime policy.')
  }

  if (approval === undefined) {
    blockReasons.push('Approval ticket is required for write actions.')
  } else if (!approval.scopes.includes('file:write')) {
    blockReasons.push('Approval ticket is missing required scope: file:write')
  }

  if (!isPathInsideWorkspace(root, resolved)) {
    blockReasons.push(`Target path is outside workspace: ${request.targetPath}`)
  } else {
    try {
      assertReadablePath(policy, root, resolved)
    } catch (err) {
      blockReasons.push(err instanceof Error ? err.message : String(err))
    }
  }

  if (request.reason.trim().length === 0) {
    blockReasons.push('Write request must include a reason.')
  }

  if (request.rollbackNote.trim().length === 0) {
    blockReasons.push('Write request must include a rollback note.')
  }

  return {
    decision: blockReasons.length === 0 ? 'ALLOWED' : 'BLOCKED',
    targetPath: request.targetPath,
    resolvedPath: resolved,
    reason: request.reason,
    rollbackNote: request.rollbackNote,
    dryRun: request.dryRun,
    blockReasons,
  }
}

export function renderLocalFileWriteGateResult(result: LocalFileWriteGateResult): string {
  const sections: string[] = [
    'CodeMind local file write gate',
    '',
    `Decision: ${result.decision}`,
    `Target: ${result.targetPath}`,
    `Dry run: ${result.dryRun ? 'yes' : 'no'}`,
    `Reason: ${result.reason}`,
    `Rollback: ${result.rollbackNote}`,
  ]

  if (result.blockReasons.length > 0) {
    sections.push('', 'Block reasons:')
    sections.push(...result.blockReasons.map((reason) => `- ${reason}`))
  }

  if (result.decision === 'ALLOWED' && result.dryRun) {
    sections.push(
      '',
      'Dry-run preview: write would be allowed.',
      'No file has been modified.',
    )
  }

  if (result.decision === 'ALLOWED' && !result.dryRun) {
    sections.push(
      '',
      'Write is allowed by policy and approval.',
    )
  }

  return sections.join('\n')
}
