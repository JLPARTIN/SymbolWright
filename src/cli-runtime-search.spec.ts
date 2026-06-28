import { describe, expect, it } from 'vitest'

import { renderRuntimeSearch } from './cli-runtime-search.js'

describe('renderRuntimeSearch', () => {
  it('returns search results for a query', async () => {
    const output = await renderRuntimeSearch('runtime')

    expect(typeof output).toBe('string')
    expect(output.length).toBeGreaterThan(0)
  })

  it('includes matching filenames', async () => {
    const output = await renderRuntimeSearch('CodeMind')

    expect(output).toContain('README.md')
  })

  it('includes boundary markers', async () => {
    const output = await renderRuntimeSearch('fixture')

    expect(output).toContain('Boundary:')
    expect(output).toContain('no writes')
  })

  it('accepts explicit cwd', async () => {
    const output = await renderRuntimeSearch('export', process.cwd())

    expect(typeof output).toBe('string')
    expect(output.length).toBeGreaterThan(0)
  })
})
