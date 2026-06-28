import { describe, expect, it } from 'vitest'

import { renderRuntimePlan } from './cli-runtime-plan.js'

describe('renderRuntimePlan', () => {
  it('returns a plan containing the goal', async () => {
    const output = await renderRuntimePlan('add error handling')

    expect(output).toContain('add error handling')
  })

  it('includes runtime boundary', async () => {
    const output = await renderRuntimePlan('refactor tests')

    expect(output).toContain('Boundary:')
    expect(output).toContain('no writes')
  })

  it('uses cwd when not provided', async () => {
    const output = await renderRuntimePlan('list files')

    expect(typeof output).toBe('string')
    expect(output.length).toBeGreaterThan(0)
  })

  it('accepts explicit cwd', async () => {
    const output = await renderRuntimePlan('check config', process.cwd())

    expect(output).toContain('check config')
  })
})
