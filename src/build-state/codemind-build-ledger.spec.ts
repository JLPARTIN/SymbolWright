import { describe, expect, it } from 'vitest'

import { RUNTIME_BUILD_PHASES } from '../runtime/runtime-build-state.js'
import {
  checkBuildLedgerConsistency,
  createBuildLedgerEntry,
  createBuildLedgerSummary,
  renderBuildLedgerConsistencyReport,
  renderBuildLedgerSummary,
} from './codemind-build-ledger.js'

describe('createBuildLedgerEntry', () => {
  it('maps a runtime phase to a ledger entry', () => {
    const phase = RUNTIME_BUILD_PHASES[0]!
    const entry = createBuildLedgerEntry(phase)

    expect(entry.phaseId).toBe('A')
    expect(entry.title).toBe('Read-only runtime activation')
    expect(entry.state).toBe('COMPLETE')
    expect(entry.commandCount).toBe(phase.activeCommands.length)
    expect(entry.boundaryCount).toBe(phase.boundary.length)
  })
})

describe('createBuildLedgerSummary', () => {
  it('returns the correct total and completed phase counts', () => {
    const summary = createBuildLedgerSummary()

    expect(summary.totalPhases).toBe(RUNTIME_BUILD_PHASES.length)
    expect(summary.completedPhases).toBe(20)
    expect(summary.nextPhase).toBeUndefined()
    expect(summary.entries).toHaveLength(RUNTIME_BUILD_PHASES.length)
    expect(summary.generatedAt).toBeTruthy()
  })

  it('includes all phases in order', () => {
    const summary = createBuildLedgerSummary()
    const ids = summary.entries.map((e) => e.phaseId)

    expect(ids).toEqual(RUNTIME_BUILD_PHASES.map((p) => p.id))
  })
})

describe('checkBuildLedgerConsistency', () => {
  const allPhasesComplete = RUNTIME_BUILD_PHASES.map((p) => `Phase ${p.id}: COMPLETE`).join('\n')

  it('reports CONSISTENT when README and docs match runtime', () => {
    const readme = 'Runtime phases:     20 complete'
    const docs = allPhasesComplete

    const report = checkBuildLedgerConsistency(readme, docs)

    expect(report.status).toBe('CONSISTENT')
    expect(report.findings).toHaveLength(0)
  })

  it('accepts the README 20/20 runtime build phases complete wording', () => {
    const readme = '`codemind status` reports 20/20 runtime build phases complete.'
    const docs = allPhasesComplete

    const report = checkBuildLedgerConsistency(readme, docs)

    expect(report.status).toBe('CONSISTENT')
    expect(report.findings).toHaveLength(0)
  })

  it('accepts the README all runtime phases are complete wording', () => {
    const readme = 'All 20 runtime phases (A–T) are complete.'
    const docs = allPhasesComplete

    const report = checkBuildLedgerConsistency(readme, docs)

    expect(report.status).toBe('CONSISTENT')
    expect(report.findings).toHaveLength(0)
  })

  it('detects README phase count mismatch', () => {
    const readme = 'Runtime phases:     5 complete'
    const docs = allPhasesComplete

    const report = checkBuildLedgerConsistency(readme, docs)

    expect(report.status).toBe('INCONSISTENT')
    expect(report.findings.some((f) => f.source === 'README.md')).toBe(true)
  })

  it('detects missing phase in runtime docs', () => {
    const readme = 'Runtime phases:     20 complete'
    const docs = 'Phase A: COMPLETE\nPhase B: COMPLETE'

    const report = checkBuildLedgerConsistency(readme, docs)

    expect(report.status).toBe('INCONSISTENT')
    expect(
      report.findings.some(
        (f) =>
          f.source === 'docs/runtime/CODEMIND_RUNTIME_BUILD_STATE.md' &&
          f.issue.includes('Phase C'),
      ),
    ).toBe(true)
  })

  it('detects stale next-phase claim when all phases are complete', () => {
    const readme = 'Runtime phases:     20 complete'
    const docs = allPhasesComplete + '\n\nNext runtime phase\n\nPhase F: Live read'

    const report = checkBuildLedgerConsistency(readme, docs)

    expect(report.status).toBe('INCONSISTENT')
    expect(
      report.findings.some((f) =>
        f.issue.includes('next phase exists but all phases are complete'),
      ),
    ).toBe(true)
  })

  it('detects README missing phase count entirely', () => {
    const readme = 'CodeMind is a platform.'
    const docs = allPhasesComplete

    const report = checkBuildLedgerConsistency(readme, docs)

    expect(report.status).toBe('INCONSISTENT')
    expect(report.findings.some((f) => f.source === 'README.md')).toBe(true)
  })
})

describe('renderBuildLedgerSummary', () => {
  it('includes total and completed counts', () => {
    const summary = createBuildLedgerSummary()
    const output = renderBuildLedgerSummary(summary)

    expect(output).toContain('Total phases: 20')
    expect(output).toContain('Completed: 20')
    expect(output).toContain('Next phase: none')
    expect(output).toContain('Phase A:')
    expect(output).toContain('Phase T:')
  })

  it('includes command and boundary counts for each phase', () => {
    const summary = createBuildLedgerSummary()
    const output = renderBuildLedgerSummary(summary)

    for (const entry of summary.entries) {
      expect(output).toContain(`${entry.commandCount} commands`)
      expect(output).toContain(`${entry.boundaryCount} boundaries`)
    }
  })
})

describe('renderBuildLedgerConsistencyReport', () => {
  it('renders CONSISTENT report without findings', () => {
    const allPhasesComplete = RUNTIME_BUILD_PHASES.map((p) => `Phase ${p.id}: COMPLETE`).join('\n')
    const report = checkBuildLedgerConsistency('20 complete', allPhasesComplete)
    const output = renderBuildLedgerConsistencyReport(report)

    expect(output).toContain('Status: CONSISTENT')
    expect(output).not.toContain('Findings:')
  })

  it('renders INCONSISTENT report with findings', () => {
    const report = checkBuildLedgerConsistency('5 complete', 'Phase A: COMPLETE')
    const output = renderBuildLedgerConsistencyReport(report)

    expect(output).toContain('Status: INCONSISTENT')
    expect(output).toContain('Findings:')
    expect(output).toContain('[README.md]')
  })
})
