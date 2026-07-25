import { describe, expect, it } from 'vitest'

import { renderRuntimeSearch } from './cli-runtime-search.js'

describe('renderRuntimeSearch', () => {
  it('returns search results for a query', async () => {
    const output = await renderRuntimeSearch('runtime')

    expect(typeof output).toBe('string')
    expect(output.length).toBeGreaterThan(0)
  })

  it('includes matching filenames', async () => {
    // The default 50-match cap combined with directory-listing order (which is filesystem- and
    // environment-dependent, not guaranteed alphabetical) means a broad query like "SymbolWright"
    // can exhaust its budget before the walk reaches the repository root's README.md, purely as
    // the codebase grows. A generous explicit limit keeps this assertion about "does search find
    // an obviously relevant file" rather than "does directory-listing order favor README.md".
    const output = await renderRuntimeSearch('SymbolWright', process.cwd(), 500)

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
