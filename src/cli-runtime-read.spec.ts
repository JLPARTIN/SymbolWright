import { describe, expect, it } from 'vitest'

import { renderRuntimeRead } from './cli-runtime-read.js'

describe('renderRuntimeRead', () => {
  it('reads a workspace file', async () => {
    const output = await renderRuntimeRead('README.md')

    expect(output).toContain('README.md')
  })

  it('includes file content', async () => {
    const output = await renderRuntimeRead('package.json')

    expect(output).toContain('codemind')
  })

  it('includes boundary markers', async () => {
    const output = await renderRuntimeRead('README.md')

    expect(output).toContain('Boundary:')
    expect(output).toContain('no writes')
  })

  it('accepts explicit cwd', async () => {
    const output = await renderRuntimeRead('README.md', process.cwd())

    expect(typeof output).toBe('string')
    expect(output.length).toBeGreaterThan(0)
  })
})
