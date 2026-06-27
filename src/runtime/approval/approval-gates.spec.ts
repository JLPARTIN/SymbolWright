import { describe, expect, it } from 'vitest'

import { assertApprovalGate } from './approval-gate.js'
import { createApprovalTicket } from './approval-ticket.js'
import { createAuditEvent, renderAuditEvents, RuntimeAuditLog } from '../audit/runtime-audit-log.js'
import { createApprovedRuntimeContext, createApprovedRuntimeRegistry } from '../runtime-approved-registry.js'
import { createDefaultRuntimePolicy } from '../policy/runtime-policy.js'
import { isValidApprovalScope, ALL_APPROVAL_SCOPES } from '../types.js'

describe('approval gates', () => {
  it('requires approval before gated execution', () => {
    expect(() => assertApprovalGate({
      requiredScope: 'apply_edit',
      workspaceRoot: process.cwd(),
      policy: createDefaultRuntimePolicy(),
    })).toThrow('approval ticket')
  })

  it('requires matching approval scope', () => {
    const approval = createApprovalTicket({
      ticketId: 'APPROVE-1',
      approvedBy: 'operator',
      scopes: ['command_dry_run'],
      reason: 'test',
    })

    expect(() => assertApprovalGate({
      approval,
      requiredScope: 'apply_edit',
      workspaceRoot: process.cwd(),
      policy: createDefaultRuntimePolicy(),
    })).toThrow('missing required scope')
  })

  it('blocks protected paths even with approval', () => {
    const approval = createApprovalTicket({
      ticketId: 'APPROVE-2',
      approvedBy: 'operator',
      scopes: ['apply_edit'],
      reason: 'test',
    })

    expect(() => assertApprovalGate({
      approval,
      requiredScope: 'apply_edit',
      workspaceRoot: process.cwd(),
      targetPath: '.git/config',
      policy: createDefaultRuntimePolicy(),
    })).toThrow('protected path')
  })
})

describe('approval-gated tools', () => {
  it('registers gated tools', () => {
    const names = createApprovedRuntimeRegistry().list().map((tool) => tool.name)

    expect(names).toContain('apply_edit_gated')
    expect(names).toContain('command_dry_run_gated')
  })

  it('renders approved edit dry-run without modifying files', async () => {
    const approval = createApprovalTicket({
      ticketId: 'APPROVE-3',
      approvedBy: 'operator',
      scopes: ['apply_edit'],
      reason: 'test',
    })
    const tool = createApprovedRuntimeRegistry().getOrThrow('apply_edit_gated')
    const output = await tool.execute(
      { path: 'README.md', proposedContent: '# Proposed\n' },
      createApprovedRuntimeContext(approval),
    )

    expect(output).toContain('CodeMind gated apply-edit')
    expect(output).toContain('No file is modified')
    expect(output).toContain('Runtime audit log')
  })

  it('renders approved command dry-run without execution', async () => {
    const approval = createApprovalTicket({
      ticketId: 'APPROVE-4',
      approvedBy: 'operator',
      scopes: ['command_dry_run'],
      reason: 'test',
    })
    const tool = createApprovedRuntimeRegistry().getOrThrow('command_dry_run_gated')
    const output = await tool.execute(
      { command: 'npm run typecheck' },
      createApprovedRuntimeContext(approval),
    )

    expect(output).toContain('CodeMind gated command dry-run')
    expect(output).toContain('No shell command is executed')
    expect(output).toContain('npm run typecheck')
  })

  it('blocks non-allowlisted commands', async () => {
    const approval = createApprovalTicket({
      ticketId: 'APPROVE-5',
      approvedBy: 'operator',
      scopes: ['command_dry_run'],
      reason: 'test',
    })
    const tool = createApprovedRuntimeRegistry().getOrThrow('command_dry_run_gated')

    await expect(tool.execute(
      { command: 'rm -rf .' },
      createApprovedRuntimeContext(approval),
    )).rejects.toThrow('not allowlisted')
  })
})

describe('isValidApprovalScope', () => {
  it('returns true for all known scopes', () => {
    for (const scope of ALL_APPROVAL_SCOPES) {
      expect(isValidApprovalScope(scope)).toBe(true)
    }
  })

  it('returns false for unknown strings', () => {
    expect(isValidApprovalScope('runtime:test')).toBe(false)
    expect(isValidApprovalScope('file:read')).toBe(false)
    expect(isValidApprovalScope('')).toBe(false)
    expect(isValidApprovalScope('APPLY_EDIT')).toBe(false)
  })

  it('ALL_APPROVAL_SCOPES contains exactly 5 scopes', () => {
    expect(ALL_APPROVAL_SCOPES).toHaveLength(5)
  })
})

describe('RuntimeAuditLog', () => {
  it('records and renders audit events', () => {
    const log = new RuntimeAuditLog()
    log.record(createAuditEvent({ action: 'test', status: 'allowed', detail: 'ok' }))

    expect(log.list()).toHaveLength(1)
    expect(renderAuditEvents(log.list())).toContain('ALLOWED test')
  })
})
