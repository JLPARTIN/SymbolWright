import { describe, expect, it } from 'vitest'

import { buildCodeMindPlan, renderCodeMindPlan } from './cli-plan.js'

describe('buildCodeMindPlan', () => {
  it('preserves the requested goal', () => {
    expect(buildCodeMindPlan('add safe patch planning').goal).toBe('add safe patch planning')
  })

  it('trims the requested goal', () => {
    expect(buildCodeMindPlan('  add plan command  ').goal).toBe('add plan command')
  })

  it('requires a goal', () => {
    expect(() => buildCodeMindPlan('   ')).toThrow('Missing goal')
  })

  it('keeps the plan non-mutating', () => {
    expect(buildCodeMindPlan('ship first plan command').boundary).toEqual([
      'does not edit files',
      'does not run shell commands',
      'does not call providers',
      'does not post PR comments',
      'does not mutate GitHub state',
    ])
  })
})

describe('renderCodeMindPlan', () => {
  it('renders an operator-readable plan', () => {
    const output = renderCodeMindPlan('add safe planning')

    expect(output).toContain('CodeMind plan')
    expect(output).toContain('Goal: add safe planning')
    expect(output).toContain('Posture:')
    expect(output).toContain('Implementation steps:')
    expect(output).toContain('Suggested validation:')
    expect(output).toContain('Boundary:')
    expect(output).toContain('npm run typecheck')
    expect(output).toContain('does not edit files')
  })
})
