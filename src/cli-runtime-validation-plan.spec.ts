import { describe, expect, it } from 'vitest'

import { renderRuntimeValidationPlan } from './cli-runtime-validation-plan.js'

describe('renderRuntimeValidationPlan', () => {
  it('returns validation plan output', async () => {
    const output = await renderRuntimeValidationPlan('type safety')

    expect(output).toContain('SymbolWright validation plan')
  })

  it('includes standard validation commands', async () => {
    const output = await renderRuntimeValidationPlan('full check')

    expect(output).toContain('npm run typecheck')
  })

  it('includes boundary assertion', async () => {
    const output = await renderRuntimeValidationPlan('lint')

    expect(output).toContain('does not run commands')
  })

  it('handles undefined focus', async () => {
    const output = await renderRuntimeValidationPlan(undefined)

    expect(output).toContain('SymbolWright validation plan')
  })

  it('accepts explicit cwd', async () => {
    const output = await renderRuntimeValidationPlan('coverage', process.cwd())

    expect(typeof output).toBe('string')
    expect(output.length).toBeGreaterThan(0)
  })
})
