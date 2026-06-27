import { describe, expect, it } from 'vitest'

import { RuntimeAuditLog, createAuditEvent, renderAuditEvents } from './runtime-audit-log.js'

describe('RuntimeAuditLog', () => {
  it('starts with empty events', () => {
    const log = new RuntimeAuditLog()
    expect(log.list()).toHaveLength(0)
  })

  it('records multiple events', () => {
    const log = new RuntimeAuditLog()
    log.record(createAuditEvent({ action: 'read', status: 'allowed', detail: 'ok' }))
    log.record(createAuditEvent({ action: 'write', status: 'blocked', detail: 'denied' }))

    expect(log.list()).toHaveLength(2)
  })

  it('returns a copy from list()', () => {
    const log = new RuntimeAuditLog()
    log.record(createAuditEvent({ action: 'test', status: 'allowed', detail: 'ok' }))

    const list1 = log.list()
    const list2 = log.list()
    expect(list1).not.toBe(list2)
    expect(list1).toEqual(list2)
  })
})

describe('createAuditEvent', () => {
  it('creates event without approval', () => {
    const event = createAuditEvent({ action: 'read_file', status: 'allowed', detail: 'read ok' })

    expect(event.action).toBe('read_file')
    expect(event.status).toBe('allowed')
    expect(event.detail).toBe('read ok')
    expect(event.ticketId).toBeUndefined()
  })

  it('includes ticketId when approval is provided', () => {
    const event = createAuditEvent({
      action: 'write_file',
      status: 'allowed',
      detail: 'write ok',
      approval: { ticketId: 'T-42', approvedBy: 'operator', scopes: ['file:write'] },
    })

    expect(event.ticketId).toBe('T-42')
  })

  it('includes ISO timestamp', () => {
    const event = createAuditEvent({ action: 'test', status: 'allowed', detail: 'ok' })

    expect(event.timestamp).toBeDefined()
    expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp)
  })
})

describe('renderAuditEvents', () => {
  it('renders empty log', () => {
    const output = renderAuditEvents([])
    expect(output).toContain('No audit events recorded')
  })

  it('renders multiple events with timestamps', () => {
    const events = [
      createAuditEvent({ action: 'read', status: 'allowed', detail: 'ok' }),
      createAuditEvent({ action: 'write', status: 'blocked', detail: 'denied' }),
    ]

    const output = renderAuditEvents(events)
    expect(output).toContain('ALLOWED read')
    expect(output).toContain('BLOCKED write')
    expect(output).toContain('Runtime audit log')
  })

  it('renders events with mixed statuses', () => {
    const events = [
      createAuditEvent({ action: 'a1', status: 'allowed', detail: 'd1' }),
      createAuditEvent({ action: 'a2', status: 'blocked', detail: 'd2' }),
      createAuditEvent({ action: 'a3', status: 'allowed', detail: 'd3' }),
    ]

    const output = renderAuditEvents(events)
    expect(output).toContain('ALLOWED a1')
    expect(output).toContain('BLOCKED a2')
    expect(output).toContain('ALLOWED a3')
  })
})
