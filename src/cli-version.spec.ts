import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { VERSION_BLOCK_ID, getVersionInfo, renderVersionInfo } from './cli-version.js'

const WORKSPACE = path.resolve(import.meta.dirname, '..')

describe('getVersionInfo', () => {
  it('returns version info with block ID', () => {
    const info = getVersionInfo(WORKSPACE)

    expect(info.blockId).toBe(VERSION_BLOCK_ID)
    expect(info.platform).toBe('Codetelligence')
    expect(info.capability).toBe('Ajna Review Cortex')
  })

  it('reads version from package.json', () => {
    const info = getVersionInfo(WORKSPACE)

    expect(info.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('includes Node.js version', () => {
    const info = getVersionInfo(WORKSPACE)

    expect(info.nodeVersion).toBe(process.version)
  })

  it('reports runtime phase count', () => {
    const info = getVersionInfo(WORKSPACE)

    expect(info.runtimePhases).toBe('20/20')
  })

  it('handles missing workspace gracefully', () => {
    const info = getVersionInfo('/nonexistent/path')

    expect(info.version).toBe('unknown')
  })
})

describe('renderVersionInfo', () => {
  it('renders readable Codetelligence output', () => {
    const info = getVersionInfo(WORKSPACE)
    const output = renderVersionInfo(info)

    expect(output).toContain('Codetelligence v')
    expect(output).toContain('Ajna Review Cortex')
    expect(output).toContain('Runtime phases:')
    expect(output).toContain('20/20')
  })
})
