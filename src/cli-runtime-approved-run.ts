import { createApprovalTicket, parseApprovalTicketId } from './runtime/approval/approval-ticket.js'
import {
  renderAuditEvents,
  createAuditEvent,
  RuntimeAuditLog,
} from './runtime/audit/runtime-audit-log.js'
import { createFixtureRegistry } from './runtime/registry/fixture-registry-factory.js'
import { createDefaultRuntimePolicy } from './runtime/policy/runtime-policy.js'
import type { RuntimeApproval, RuntimeToolContext } from './runtime/types.js'

function createApprovedContext(approval: RuntimeApproval, cwd: string): RuntimeToolContext {
  const base = createDefaultRuntimePolicy()
  return {
    cwd,
    policy: {
      ...base,
      mode: 'APPROVED_EXECUTION',
    },
    approval,
  }
}

export async function renderApprovedRuntimeRun(
  args: readonly string[],
  cwd: string = process.cwd(),
): Promise<string> {
  const ticketId = parseApprovalTicketId(args)
  const goal = args
    .filter((arg, index) => arg !== '--approval-ticket' && args[index - 1] !== '--approval-ticket')
    .join(' ')
    .trim()

  if (ticketId === undefined || ticketId.trim().length === 0) {
    throw new Error('Missing required flag: codemind runtime run <goal> --approval-ticket <id>')
  }

  if (goal.length === 0) {
    throw new Error('Missing goal: codemind runtime run <goal> --approval-ticket <id>')
  }

  const approval = createApprovalTicket({
    ticketId,
    approvedBy: 'operator',
    scopes: ['apply_edit', 'command_dry_run'],
    reason: `approved dry-run representation for ${goal}`,
  })
  const registry = createFixtureRegistry('approved')
  const context = createApprovedContext(approval, cwd)
  const audit = new RuntimeAuditLog()

  const editResult = await registry
    .getOrThrow('apply_edit_gated')
    .execute({ path: 'README.md', proposedContent: `# Proposed change for ${goal}\n` }, context)
  const commandResult = await registry
    .getOrThrow('command_dry_run_gated')
    .execute({ command: 'npm run typecheck' }, context)

  audit.record(
    createAuditEvent({
      action: 'runtime_run_approved',
      status: 'allowed',
      approval,
      detail: `approved runtime dry-run completed for ${goal}`,
    }),
  )

  return [
    'CodeMind approved runtime run',
    '',
    `Goal: ${goal}`,
    `Ticket: ${approval.ticketId}`,
    '',
    editResult,
    '',
    commandResult,
    '',
    renderAuditEvents(audit.list()),
    '',
    'Boundary:',
    '- approval-gated dry-run representation only',
    '- no file is modified',
    '- no shell command is executed',
    '- no network is used',
    '- no GitHub write is performed',
  ].join('\n')
}
