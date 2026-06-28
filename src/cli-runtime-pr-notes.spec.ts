import { describe, expect, it } from 'vitest'

import { renderRuntimePrNotes } from './cli-runtime-pr-notes.js'

describe('renderRuntimePrNotes', () => {
  it('returns PR notes output', async () => {
    const output = await renderRuntimePrNotes('runtime activation')

    expect(typeof output).toBe('string')
    expect(output.length).toBeGreaterThan(0)
  })

  it('includes focus when provided', async () => {
    const output = await renderRuntimePrNotes('test coverage')

    expect(output).toContain('test coverage')
  })

  it('handles undefined focus', async () => {
    const output = await renderRuntimePrNotes(undefined)

    expect(typeof output).toBe('string')
    expect(output.length).toBeGreaterThan(0)
  })

  it('accepts explicit cwd', async () => {
    const output = await renderRuntimePrNotes('safety', process.cwd())

    expect(typeof output).toBe('string')
    expect(output.length).toBeGreaterThan(0)
  })
})
