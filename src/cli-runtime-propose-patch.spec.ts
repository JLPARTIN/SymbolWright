import { describe, expect, it } from 'vitest'

import { renderRuntimeProposePatch } from './cli-runtime-propose-patch.js'

describe('renderRuntimeProposePatch', () => {
  it('returns a patch proposal containing the goal', async () => {
    const output = await renderRuntimeProposePatch('fix linting errors')

    expect(output).toContain('fix linting errors')
  })

  it('includes boundary assertions', async () => {
    const output = await renderRuntimeProposePatch('refactor module')

    expect(output).toContain('Boundary:')
  })

  it('uses cwd when not provided', async () => {
    const output = await renderRuntimeProposePatch('add tests')

    expect(typeof output).toBe('string')
    expect(output.length).toBeGreaterThan(0)
  })

  it('accepts explicit cwd', async () => {
    const output = await renderRuntimeProposePatch('update types', process.cwd())

    expect(output).toContain('update types')
  })
})
