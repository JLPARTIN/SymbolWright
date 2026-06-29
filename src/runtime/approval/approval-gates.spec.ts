import { describe, expect, it } from 'vitest'

import {
  assertApprovalGate,
  formatApprovalSummary,
  toWorkspaceRelativePath,
} from './approval-gate.js'
import { createApprovalTicket } from './approval-ticket.js'
import { createAuditEvent, renderAuditEvents, RuntimeAuditLog } from '../audit/runtime-audit-log.js'
import { createDefaultRuntimePolicy } from '../policy/runtime-policy.js'
import { isValidApprovalScope, ALL_APPROVAL_SCOPES } from '../types.js'

describe('approval gates', () => {
  it('requires approval before gated execution', () => {
    expect(() =>
      assertApprovalGate({
        requiredScope: 'file:write',
        workspaceRoot: process.cwd(),
        policy: createDefaultRuntimePolicy(),
      }),
    ).toThrow('approval ticket')
  })

  it('requires matching approval scope', () => {
    const approval = createApprovalTicket({
      ticketId: 'APPROVE-1',
      approvedBy: 'operator',
      scopes: ['command:validate'],
      reason: 'test',
    })

    expect(() =>
      assertApprovalGate({
        approval,
        requiredScope: 'file:write',
        workspaceRoot: process.cwd(),
        policy: createDefaultRuntimePolicy(),
      }),
    ).toThrow('missing required scope')
  })

  it('blocks protected paths even with approval', () => {
    const approval = createApprovalTicket({
      ticketId: 'APPROVE-2',
      approvedBy: 'operator',
      scopes: ['file:write'],
      reason: 'test',
    })

    expect(() =>
      assertApprovalGate({
        approval,
        requiredScope: 'file:write',
        workspaceRoot: process.cwd(),
        targetPath: 'node_modules/package.json',
        policy: createDefaultRuntimePolicy(),
      }),
    ).toThrow('protected path')
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

  it('ALL_APPROVAL_SCOPES contains exactly 7 scopes', () => {
    expect(ALL_APPROVAL_SCOPES).toHaveLength(7)
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

describe('createApprovalTicket edge cases', () => {
  it('throws on whitespace-only ticketId', () => {
    expect(() =>
      createApprovalTicket({
        ticketId: '   ',
        approvedBy: 'operator',
        scopes: ['file:write'],
        reason: 'test',
      }),
    ).toThrow('ticket id is required')
  })

  it('throws on whitespace-only approvedBy', () => {
    expect(() =>
      createApprovalTicket({
        ticketId: 'T-1',
        approvedBy: '   ',
        scopes: ['file:write'],
        reason: 'test',
      }),
    ).toThrow('approver is required')
  })

  it('trims and defaults empty reason', () => {
    const ticket = createApprovalTicket({
      ticketId: 'T-1',
      approvedBy: 'operator',
      scopes: ['file:write'],
      reason: '   ',
    })
    expect(ticket.reason).toBe('operator-approved execution gate')
  })

  it('defaults createdAt to epoch ISO string', () => {
    const ticket = createApprovalTicket({
      ticketId: 'T-1',
      approvedBy: 'operator',
      scopes: ['file:write'],
      reason: 'test',
    })
    expect(ticket.createdAt).toBe(new Date(0).toISOString())
  })
})

describe('formatApprovalSummary', () => {
  it('renders all approval fields', () => {
    const output = formatApprovalSummary({
      ticketId: 'TKT-42',
      approvedBy: 'admin',
      scopes: ['file:write', 'github:write'],
    })

    expect(output).toContain('Ticket: TKT-42')
    expect(output).toContain('Approved by: admin')
    expect(output).toContain('file:write, github:write')
  })
})

describe('toWorkspaceRelativePath', () => {
  it('resolves relative path', () => {
    const result = toWorkspaceRelativePath(process.cwd(), 'src/index.ts')
    expect(result).toBe('src/index.ts')
  })
})
