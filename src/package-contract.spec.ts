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
})
