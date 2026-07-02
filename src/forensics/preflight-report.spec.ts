import { describe, expect, it } from 'vitest'

import { buildPreflightReport, renderPreflightReport } from './preflight-report.js'
import type { CommandResult, FailureLedger } from './types.js'

const EMPTY_LEDGER: FailureLedger = { schemaVersion: 1, failures: [] }

describe('buildPreflightReport', () => {
  it('builds a READY report and renders it with all sections', async () => {
    const report = await buildPreflightReport(
      {
        repoRoot: '/repo',
        changedFiles: ['src/index.ts'],
        ledger: EMPTY_LEDGER,
        packageManager: 'npm',
        availableScripts: new Set(['format:check', 'lint', 'typecheck', 'test', 'build']),
      },
      (request): CommandResult => ({
        script: request.script,
        command: request.command,
        packageManager: request.packageManager,
        status: 'passed',
        exitCode: 0,
        stdout: '',
        stderr: '',
        durationMs: 1,
      }),
    )

    expect(report.verdict).toBe('READY')

    const rendered = renderPreflightReport(report)
    expect(rendered).toContain('Verdict: READY')
    expect(rendered).toContain('Changed files:')
    expect(rendered).toContain('src/index.ts')
    expect(rendered).toContain('Validation commands:')
  })

  it('renders remaining risks and prevented failures when present', () => {
    const rendered = renderPreflightReport({
      verdict: 'NEEDS_WORK',
      confidence: 50,
      changedFiles: [],
      validationCommands: [],
      forensicGates: ['workflow-validation'],
      failuresPrevented: ['FORMAT_CHECK_FAILURE'],
      remainingRisks: ['lint failed'],
      pushRecommendation: 'DO_NOT_PUSH',
    })

    expect(rendered).toContain('Forensic gates triggered:')
    expect(rendered).toContain('workflow-validation')
    expect(rendered).toContain('Prevented recurring failures:')
    expect(rendered).toContain('FORMAT_CHECK_FAILURE')
    expect(rendered).toContain('Remaining risks:')
    expect(rendered).toContain('lint failed')
  })

  it('renders a minimal report with no changed files or commands', () => {
    const rendered = renderPreflightReport({
      verdict: 'READY',
      confidence: 100,
      changedFiles: [],
      validationCommands: [],
      forensicGates: [],
      failuresPrevented: [],
      remainingRisks: [],
      pushRecommendation: 'SAFE_TO_PUSH',
    })

    expect(rendered).not.toContain('Changed files:')
    expect(rendered).not.toContain('Validation commands:')
  })
})
