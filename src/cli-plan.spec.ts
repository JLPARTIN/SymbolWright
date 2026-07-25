import { describe, expect, it } from 'vitest'

import { buildSymbolWrightPlan, renderSymbolWrightPlan } from './cli-plan.js'

describe('buildSymbolWrightPlan', () => {
  it('preserves the requested goal', () => {
    expect(buildSymbolWrightPlan('add safe patch planning').goal).toBe('add safe patch planning')
  })

  it('trims the requested goal', () => {
    expect(buildSymbolWrightPlan('  add plan command  ').goal).toBe('add plan command')
  })

  it('requires a goal', () => {
    expect(() => buildSymbolWrightPlan('   ')).toThrow('Missing goal')
  })

  it('keeps the plan non-mutating', () => {
    expect(buildSymbolWrightPlan('ship first plan command').boundary).toEqual([
      'does not edit files',
      'does not run shell commands',
      'does not call providers',
      'does not post PR comments',
      'does not mutate GitHub state',
    ])
  })
})

describe('renderSymbolWrightPlan', () => {
  it('renders an operator-readable plan', () => {
    const output = renderSymbolWrightPlan('add safe planning')

    expect(output).toContain('SymbolWright plan')
    expect(output).toContain('Goal: add safe planning')
    expect(output).toContain('Posture:')
    expect(output).toContain('Implementation steps:')
    expect(output).toContain('Suggested validation:')
    expect(output).toContain('Boundary:')
    expect(output).toContain('npm run typecheck')
    expect(output).toContain('does not edit files')
  })
})
