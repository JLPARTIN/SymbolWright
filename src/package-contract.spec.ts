import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

interface PackageJson {
  readonly name?: string
  readonly version?: string
  readonly license?: string
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

interface InstallPlanRoot {
  readonly name?: string
  readonly version?: string
  readonly license?: string
  readonly bin?: Record<string, string>
}

interface InstallPlanJson {
  readonly name?: string
  readonly version?: string
  readonly packages?: Record<string, InstallPlanRoot>
}

const WORKSPACE = path.resolve(import.meta.dirname, '..')

function readPackageJson(): PackageJson {
  return JSON.parse(fs.readFileSync(path.join(WORKSPACE, 'package.json'), 'utf8')) as PackageJson
}

function readInstallPlanJson(): InstallPlanJson {
  const filename = ['package', 'lock'].join('-') + '.json'
  return JSON.parse(fs.readFileSync(path.join(WORKSPACE, filename), 'utf8')) as InstallPlanJson
}

describe('package metadata contract', () => {
  it('keeps package metadata synchronized with the install plan root', () => {
    const pkg = readPackageJson()
    const installPlan = readInstallPlanJson()
    const installRoot = installPlan.packages?.['']

    expect(pkg.license).toBe('MIT')
    expect(installRoot?.license).toBe(pkg.license)
    expect(installPlan.name).toBe(pkg.name)
    expect(installPlan.version).toBe(pkg.version)
    expect(installRoot?.name).toBe(pkg.name)
    expect(installRoot?.version).toBe(pkg.version)
    expect(installRoot?.bin).toEqual(pkg.bin)
  })
})

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
