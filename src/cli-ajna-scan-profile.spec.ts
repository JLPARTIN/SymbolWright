import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  buildAjnaScanProfileForRepo,
  renderAjnaScanProfileForRepo,
} from './cli-ajna-scan-profile.js'

const tempDirs: string[] = []

function makeRepoFixture(options: { guarded?: boolean } = {}): string {
  const guarded = options.guarded ?? true
  const rootDir = mkdtempSync(join(tmpdir(), 'symbolwright-ajna-scan-profile-'))
  tempDirs.push(rootDir)

  writeFileSync(
    join(rootDir, 'package.json'),
    JSON.stringify({ name: 'fixture-repo', version: '1.0.0' }),
  )

  if (guarded) {
    mkdirSync(join(rootDir, 'src'))
    writeFileSync(join(rootDir, 'src', 'index.ts'), 'export const value = 1\n')
    writeFileSync(join(rootDir, 'src', 'index.spec.ts'), "import { value } from './index.js'\n")
    writeFileSync(join(rootDir, 'tsconfig.json'), '{}\n')
    writeFileSync(join(rootDir, 'eslint.config.js'), 'export default []\n')
    writeFileSync(join(rootDir, '.prettierrc'), '{}\n')
  }

  return rootDir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('buildAjnaScanProfileForRepo', () => {
  it('builds a read-only Ajna profile from existing symbolwright scan facts', () => {
    const result = buildAjnaScanProfileForRepo(makeRepoFixture())

    expect(result.profile.status).toBe('READY')
    expect(result.profile.signals.map((signal) => signal.id)).toContain('source.root')
    expect(result.profile.runtimeBoundary.providerInvocationAllowed).toBe(false)
    expect(result.profile.runtimeBoundary.repoMutationAllowed).toBe(false)
    expect(result.profile.runtimeBoundary.githubWriteAllowed).toBe(false)
    expect(result.profile.runtimeBoundary.commandExecutionAllowed).toBe(false)
  })

  it('blocks the Ajna profile when required scan-derived proof is missing', () => {
    const result = buildAjnaScanProfileForRepo(makeRepoFixture({ guarded: false }))

    expect(result.profile.status).toBe('BLOCKED')
    expect(result.profile.recommendations).toContain(
      'Add or point SymbolWright at a repository with a src/ source root before Ajna scan profiling.',
    )
  })
})

describe('renderAjnaScanProfileForRepo', () => {
  it('renders CLI-safe Ajna scan profile output', () => {
    const output = renderAjnaScanProfileForRepo(makeRepoFixture())

    expect(output).toContain('Ajna scan profile')
    expect(output).toContain('Status: READY')
    expect(output).toContain('Signals:')
    expect(output).toContain('Recommendations:')
    expect(output).toContain('READ_ONLY')
    expect(output).toContain('no providers, writes, commands, or GitHub mutations allowed')
  })
})
