import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

import { renderBuildLedgerCommand } from './cli-build-ledger.js'
import { RUNTIME_BUILD_PHASES } from './runtime/runtime-build-state.js'

describe('renderBuildLedgerCommand', () => {
  it('includes the build ledger summary', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'bl-test-'))
    const output = renderBuildLedgerCommand(tempDir)

    expect(output).toContain('SymbolWright Build Ledger')
    expect(output).toContain('Total phases: 20')
    expect(output).toContain('Completed: 20')
    expect(output).toContain('Phase A:')
    expect(output).toContain('Phase T:')
  })

  it('includes consistency check output', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'bl-test-'))
    const output = renderBuildLedgerCommand(tempDir)

    expect(output).toContain('Build Ledger Consistency Check')
    expect(output).toContain('Status:')
  })

  it('reports CONSISTENT when docs match runtime', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'bl-test-'))
    writeFileSync(join(tempDir, 'README.md'), 'Runtime phases:     20 complete')
    mkdirSync(join(tempDir, 'docs', 'runtime'), { recursive: true })
    const docsContent = RUNTIME_BUILD_PHASES.map((p) => `Phase ${p.id}: COMPLETE`).join('\n')
    writeFileSync(
      join(tempDir, 'docs', 'runtime', 'SYMBOLWRIGHT_RUNTIME_BUILD_STATE.md'),
      docsContent,
    )

    const output = renderBuildLedgerCommand(tempDir)

    expect(output).toContain('Status: CONSISTENT')
  })

  it('reports INCONSISTENT when README phase count is wrong', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'bl-test-'))
    writeFileSync(join(tempDir, 'README.md'), 'Runtime phases:     5 complete')
    mkdirSync(join(tempDir, 'docs', 'runtime'), { recursive: true })
    const docsContent = RUNTIME_BUILD_PHASES.map((p) => `Phase ${p.id}: COMPLETE`).join('\n')
    writeFileSync(
      join(tempDir, 'docs', 'runtime', 'SYMBOLWRIGHT_RUNTIME_BUILD_STATE.md'),
      docsContent,
    )

    const output = renderBuildLedgerCommand(tempDir)

    expect(output).toContain('Status: INCONSISTENT')
    expect(output).toContain('[README.md]')
  })

  it('handles missing workspace gracefully', () => {
    const output = renderBuildLedgerCommand('/nonexistent/path')

    expect(output).toContain('SymbolWright Build Ledger')
    expect(output).toContain('Build Ledger Consistency Check')
  })
})
