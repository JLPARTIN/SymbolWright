import { assertApprovalGate, formatApprovalSummary } from '../approval/approval-gate.js'
import { createAuditEvent, RuntimeAuditLog, renderAuditEvents } from '../audit/runtime-audit-log.js'
import type { RuntimeApproval, RuntimeToolContext, RuntimeToolDefinition } from '../types.js'

export interface CommandDryRunGatedInput {
  readonly command: string
}

const ALLOWED_COMMANDS = [
  'npm run typecheck',
  'npm test',
  'npm run test:coverage',
  'npm run lint',
  'npm run audit',
  'npm run build',
] as const

function parseCommandInput(input: unknown): CommandDryRunGatedInput {
  if (typeof input !== 'object' || input === null || !('command' in input)) {
    throw new Error('Missing command for gated command dry-run.')
  }

  const command = (input as { readonly command: unknown }).command
  if (typeof command !== 'string') {
    throw new Error('Missing command for gated command dry-run.')
  }

  return { command }
}

function requireApproval(context: RuntimeToolContext): RuntimeApproval {
  if (context.approval === undefined) {
    throw new Error('Approved execution requires an approval ticket.')
  }

  return context.approval
}

export async function executeCommandDryRunGatedTool(
  input: CommandDryRunGatedInput,
  context: RuntimeToolContext,
): Promise<string> {
  const audit = new RuntimeAuditLog()
  const command = input.command.trim()
  const approval = requireApproval(context)

  assertApprovalGate({
    approval,
    requiredScope: 'command_dry_run',
    workspaceRoot: context.cwd,
    policy: context.policy,
  })

  if (!ALLOWED_COMMANDS.includes(command as typeof ALLOWED_COMMANDS[number])) {
    audit.record(createAuditEvent({
      action: 'command_dry_run_gated',
      status: 'blocked',
      approval,
      detail: `command is not allowlisted: ${command}`,
    }))
    throw new Error(`Command is not allowlisted: ${command}`)
  }

  audit.record(createAuditEvent({
    action: 'command_dry_run_gated',
    status: 'allowed',
    approval,
    detail: `dry-run command approved: ${command}`,
  }))

  return [
    'CodeMind gated command dry-run',
    '',
    formatApprovalSummary(approval),
    '',
    `Command: ${command}`,
    '',
    'Execution note:',
    '- Approval gate passed, but this Phase D tool only represents the command.',
    '- No shell command is executed by this tool.',
    '',
    renderAuditEvents(audit.list()),
  ].join('\n')
}

export const commandDryRunGatedTool: RuntimeToolDefinition = {
  name: 'command_dry_run_gated',
  description: 'Represent an approved allowlisted command without executing it.',
  capability: 'APPROVED_COMMAND',
  execute: async (input, context) => executeCommandDryRunGatedTool(parseCommandInput(input), context),
}
