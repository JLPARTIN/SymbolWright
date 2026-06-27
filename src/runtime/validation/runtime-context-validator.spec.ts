import { describe, expect, it } from 'vitest'

import { assertValidToolContext } from './runtime-context-validator.js'
import { createDefaultRuntimePolicy } from '../policy/runtime-policy.js'

describe('assertValidToolContext', () => {
  const validContext = {
    cwd: '/workspace',
    policy: createDefaultRuntimePolicy(),
  }

  it('accepts a valid context without approval', () => {
    expect(() => assertValidToolContext(validContext)).not.toThrow()
  })

  it('accepts a valid context with approval', () => {
    expect(() => assertValidToolContext({
      ...validContext,
      approval: {
        ticketId: 'T-1',
        approvedBy: 'operator',
        scopes: ['file:write'],
      },
    })).not.toThrow()
  })

  it('rejects null', () => {
    expect(() => assertValidToolContext(null)).toThrow('non-null object')
  })

  it('rejects non-object', () => {
    expect(() => assertValidToolContext('string')).toThrow('non-null object')
  })

  it('rejects empty cwd', () => {
    expect(() => assertValidToolContext({ ...validContext, cwd: '' })).toThrow('cwd must be a non-empty string')
  })

  it('rejects whitespace-only cwd', () => {
    expect(() => assertValidToolContext({ ...validContext, cwd: '   ' })).toThrow('cwd must be a non-empty string')
  })

  it('rejects missing cwd', () => {
    expect(() => assertValidToolContext({ policy: validContext.policy })).toThrow('cwd must be a non-empty string')
  })

  it('rejects invalid policy', () => {
    expect(() => assertValidToolContext({ cwd: '/workspace', policy: {} })).toThrow()
  })

  it('rejects approval with empty ticketId', () => {
    expect(() => assertValidToolContext({
      ...validContext,
      approval: { ticketId: '', approvedBy: 'op', scopes: ['file:write'] },
    })).toThrow('ticketId must be a non-empty string')
  })

  it('rejects approval with empty approvedBy', () => {
    expect(() => assertValidToolContext({
      ...validContext,
      approval: { ticketId: 'T-1', approvedBy: '  ', scopes: ['file:write'] },
    })).toThrow('approvedBy must be a non-empty string')
  })

  it('rejects approval with non-array scopes', () => {
    expect(() => assertValidToolContext({
      ...validContext,
      approval: { ticketId: 'T-1', approvedBy: 'op', scopes: 'file:write' },
    })).toThrow('scopes must be an array')
  })

  it('rejects approval with invalid scope', () => {
    expect(() => assertValidToolContext({
      ...validContext,
      approval: { ticketId: 'T-1', approvedBy: 'op', scopes: ['invalid:scope'] },
    })).toThrow('Invalid approval scope')
  })
})
