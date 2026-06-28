import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

interface PackageJson {
  readonly name?: string
  readonly main?: string
  readonly types?: string
  readonly exports?: {
    readonly '.': {
      readonly import?: string
      readonly types?: string
    }
  }
  readonly bin?: Record<string, string>
  readonly files?: readonly string[]
}

const WORKSPACE = path.resolve(import.meta.dirname, '..')

function readPackageJson(): PackageJson {
  return JSON.parse(fs.readFileSync(path.join(WORKSPACE, 'package.json'), 'utf8')) as PackageJson
}

describe('package public API contract', () => {
  it('exports the package root through the built index with declarations', () => {
    const pkg = readPackageJson()
    const rootExport = pkg.exports?.['.']

    expect(pkg.name).toBe('codemind')
    expect(pkg.main).toBe('dist/index.js')
    expect(pkg.types).toBe('dist/index.d.ts')
    expect(rootExport?.import).toBe('./dist/index.js')
    expect(rootExport?.types).toBe('./dist/index.d.ts')
    expect(pkg.files).toEqual(['dist'])
  })

  it('keeps release readiness symbols on the public source index', () => {
    const indexContent = fs.readFileSync(path.join(WORKSPACE, 'src', 'index.ts'), 'utf8')

    expect(indexContent).toContain('assessReleaseReadiness')
    expect(indexContent).toContain('renderReleaseReadinessReport')
    expect(indexContent).toContain('RELEASE_READINESS_BLOCK_ID')
    expect(indexContent).toContain('ReleaseGateCode')
  })
})

describe('package bin contract', () => {
  it('maps package binaries to built CLI entry points with source parity', () => {
    const pkg = readPackageJson()

    expect(pkg.bin?.['codemind']).toBe('dist/cli.js')
    expect(pkg.bin?.['codemind-workspace']).toBe('dist/cli-workspace-bin.js')
    expect(fs.existsSync(path.join(WORKSPACE, 'src', 'cli.ts'))).toBe(true)
    expect(fs.existsSync(path.join(WORKSPACE, 'src', 'cli-workspace-bin.ts'))).toBe(true)
  })
})
