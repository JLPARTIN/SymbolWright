import { describe, expect, it } from 'vitest'

import { createRuntimeSession } from './runtime-session.js'

describe('createRuntimeSession', () => {
  it('creates a session with valid goal', () => {
    const session = createRuntimeSession('Analyze codebase')

    expect(session.goal).toBe('Analyze codebase')
    expect(session.mode).toBe('READ_ONLY')
    expect(session.transcript.goal).toBe('Analyze codebase')
    expect(session.transcript.entries).toHaveLength(0)
  })

  it('trims goal whitespace', () => {
    const session = createRuntimeSession('  spaced goal  ')
    expect(session.goal).toBe('spaced goal')
  })

  it('throws on empty string', () => {
    expect(() => createRuntimeSession('')).toThrow('Missing goal')
  })

  it('throws on whitespace-only string', () => {
    expect(() => createRuntimeSession('   ')).toThrow('Missing goal')
  })

  it('uses default maxIterations of 4', () => {
    const session = createRuntimeSession('test')
    expect(session.maxIterations).toBe(4)
  })

  it('accepts custom maxIterations', () => {
    const session = createRuntimeSession('test', 10)
    expect(session.maxIterations).toBe(10)
  })

  it('generates id starting with readonly-', () => {
    const session = createRuntimeSession('test')
    expect(session.id).toMatch(/^readonly-/)
  })
})
