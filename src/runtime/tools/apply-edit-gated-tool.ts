import {
  assertApprovalGate,
  formatApprovalSummary,
  toWorkspaceRelativePath,
} from '../approval/approval-gate.js'
import { createAuditEvent, RuntimeAuditLog, renderAuditEvents } from '../audit/runtime-audit-log.js'
import type { RuntimeApproval, RuntimeToolContext, RuntimeToolDefinition } from '../types.js'

export interface ApplyEditGatedInput {
  readonly path: string
  readonly proposedContent: string
}

function parseApplyEditInput(input: unknown): ApplyEditGatedInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing gated edit input.')
  }

  const value = input as Record<string, unknown>
  if (typeof value['path'] !== 'string' || typeof value['proposedContent'] !== 'string') {
    throw new Error('Gated edit requires path and proposedContent.')
  }

  return { path: value['path'], proposedContent: value['proposedContent'] }
}

function requireApproval(context: RuntimeToolContext): RuntimeApproval {
  if (context.approval === undefined) {
    throw new Error('Approved execution requires an approval ticket.')
  }

  return context.approval
}

export async function executeApplyEditGatedTool(
  input: ApplyEditGatedInput,
  context: RuntimeToolContext,
): Promise<string> {
  const audit = new RuntimeAuditLog()
  const approval = requireApproval(context)

  assertApprovalGate({
    approval,
    requiredScope: 'apply_edit',
    workspaceRoot: context.cwd,
    targetPath: input.path,
    policy: context.policy,
  })

  audit.record(
    createAuditEvent({
      action: 'apply_edit_gated',
      status: 'allowed',
      approval,
      detail: `dry-run edit approved for ${toWorkspaceRelativePath(context.cwd, input.path)}`,
    }),
  )

  return [
    'CodeMind gated apply-edit',
    '',
    formatApprovalSummary(approval),
    '',
    `Target: ${toWorkspaceRelativePath(context.cwd, input.path)}`,
    `Proposed bytes: ${input.proposedContent.length}`,
    '',
    'Execution note:',
    '- Approval gate passed, but this Phase D tool still emits a dry-run representation only.',
    '- No file is modified by this tool.',
    '',
    renderAuditEvents(audit.list()),
  ].join('\n')
}

export const applyEditGatedTool: RuntimeToolDefinition = {
  name: 'apply_edit_gated',
  description: 'Represent an approved edit without applying it by default.',
  capability: 'APPROVED_EDIT',
  execute: async (input, context) => executeApplyEditGatedTool(parseApplyEditInput(input), context),
}
