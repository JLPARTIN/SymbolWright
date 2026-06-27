import { describe, expect, it } from 'vitest'

import type { RuntimeApproval } from '../types.js'
import type { ValidationCommandGateResult } from './validation-command-gate.js'
import { createValidationCommandAuditEvent } from './validation-command-audit.js'

const approval: RuntimeApproval = {
  ticketId: 'AUDIT-001',
  approvedBy: 'operator',
  scopes: ['command:validate'],
}

describe('createValidationCommandAuditEvent', () => {
  it('creates blocked event with block reasons', () => {
    const gateResult: ValidationCommandGateResult = {
      decision: 'BLOCKED',
      command: 'rm -rf /',
      reason: 'test',
      dryRun: false,
      blockReasons: ['Command not allowlisted', 'No approval'],
    }

    const event = createValidationCommandAuditEvent(gateResult, undefined)

    expect(event.action).toBe('validation_command')
    expect(event.status).toBe('blocked')
    expect(event.detail).toContain('rm -rf /')
    expect(event.detail).toContain('Command not allowlisted')
    expect(event.detail).toContain('No approval')
  })

  it('creates blocked event with approval attached', () => {
    const gateResult: ValidationCommandGateResult = {
      decision: 'BLOCKED',
      command: 'npm run typecheck',
      reason: 'test',
      dryRun: false,
      blockReasons: ['Shell execution is disabled'],
    }

    const event = createValidationCommandAuditEvent(gateResult, approval)

    expect(event.status).toBe('blocked')
    expect(event.ticketId).toBe('AUDIT-001')
  })

  it('creates allowed event for dry-run', () => {
    const gateResult: ValidationCommandGateResult = {
      decision: 'ALLOWED',
      command: 'npm run typecheck',
      reason: 'type safety',
      dryRun: true,
      blockReasons: [],
    }

    const event = createValidationCommandAuditEvent(gateResult, approval)

    expect(event.action).toBe('validation_command')
    expect(event.status).toBe('allowed')
    expect(event.detail).toContain('Dry-run')
    expect(event.detail).toContain('npm run typecheck')
    expect(event.detail).toContain('type safety')
  })

  it('creates allowed event for real execution', () => {
    const gateResult: ValidationCommandGateResult = {
      decision: 'ALLOWED',
      command: 'npm run lint',
      reason: 'check formatting',
      dryRun: false,
      blockReasons: [],
    }

    const event = createValidationCommandAuditEvent(gateResult, approval)

    expect(event.status).toBe('allowed')
    expect(event.detail).toContain('allowed')
    expect(event.detail).toContain('npm run lint')
    expect(event.ticketId).toBe('AUDIT-001')
  })

  it('creates allowed event without approval', () => {
    const gateResult: ValidationCommandGateResult = {
      decision: 'ALLOWED',
      command: 'npm run typecheck',
      reason: 'test',
      dryRun: false,
      blockReasons: [],
    }

    const event = createValidationCommandAuditEvent(gateResult, undefined)

    expect(event.status).toBe('allowed')
    expect(event.ticketId).toBeUndefined()
  })
})
