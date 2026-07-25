import { describe, expect, it } from 'vitest'
import type { SymbolWrightRepoScan } from './cli-scan.js'
import { renderScan, scanRepo } from './cli-scan.js'

const FIXTURE: SymbolWrightRepoScan = {
  rootDir: '/home/user/project',
  packageName: 'my-lib',
  packageVersion: '1.2.3',
  packageDescription: 'A test library',
  topLevelDirs: ['docs', 'src'],
  tsFileCount: 42,
  specFileCount: 10,
  hasGit: true,
  hasTypeScriptConfig: true,
  hasEslintConfig: true,
  hasPrettierConfig: false,
}

describe('renderScan', () => {
  it('shows package name and version', () => {
    const output = renderScan(FIXTURE)
    expect(output).toContain('my-lib')
    expect(output).toContain('1.2.3')
  })

  it('shows description when present', () => {
    expect(renderScan(FIXTURE)).toContain('A test library')
  })

  it('omits description line when null', () => {
    const output = renderScan({ ...FIXTURE, packageDescription: null })
    expect(output).not.toContain('Description')
  })

  it('shows TypeScript file count and spec count', () => {
    const output = renderScan(FIXTURE)
    expect(output).toContain('42')
    expect(output).toContain('10 spec files')
  })

  it('lists top-level directories', () => {
    const output = renderScan(FIXTURE)
    expect(output).toContain('docs')
    expect(output).toContain('src')
  })

  it('shows tooling presence', () => {
    const output = renderScan(FIXTURE)
    expect(output).toContain('TypeScript:')
    expect(output).toContain('ESLint:')
    expect(output).toContain('Prettier:')
  })

  it('shows READ_ONLY mode', () => {
    expect(renderScan(FIXTURE)).toContain('READ_ONLY')
  })

  it('shows (unnamed) when packageName is null', () => {
    expect(renderScan({ ...FIXTURE, packageName: null })).toContain('(unnamed)')
  })
})

describe('scanRepo', () => {
  it('returns the correct package name for this project', () => {
    const scan = scanRepo(process.cwd())
    expect(scan.packageName).toBe('codemind')
  })

  it('detects TypeScript config', () => {
    expect(scanRepo(process.cwd()).hasTypeScriptConfig).toBe(true)
  })

  it('detects ESLint config', () => {
    expect(scanRepo(process.cwd()).hasEslintConfig).toBe(true)
  })

  it('detects Prettier config', () => {
    expect(scanRepo(process.cwd()).hasPrettierConfig).toBe(true)
  })

  it('detects Git', () => {
    expect(scanRepo(process.cwd()).hasGit).toBe(true)
  })

  it('counts TypeScript source files', () => {
    const scan = scanRepo(process.cwd())
    expect(scan.tsFileCount).toBeGreaterThan(0)
    expect(scan.specFileCount).toBeGreaterThan(0)
    expect(scan.specFileCount).toBeLessThan(scan.tsFileCount)
  })

  it('includes src in top-level directories', () => {
    expect(scanRepo(process.cwd()).topLevelDirs).toContain('src')
  })
})
