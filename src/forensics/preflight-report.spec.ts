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

  it('includes stdout/stderr tails for failed and blocked commands but not passed ones', () => {
    const rendered = renderPreflightReport({
      verdict: 'NEEDS_WORK',
      confidence: 25,
      changedFiles: [],
      validationCommands: [
        {
          script: 'typecheck',
          command: 'npm run typecheck',
          packageManager: 'npm',
          status: 'failed',
          exitCode: 1,
          stdout: '',
          stderr: 'error TS2322: Type mismatch',
          durationMs: 10,
        },
        {
          script: 'build',
          command: 'npm run build',
          packageManager: 'npm',
          status: 'blocked',
          exitCode: null,
          stdout: '',
          stderr: 'Sandbox runner unavailable',
          durationMs: 0,
        },
        {
          script: 'lint',
          command: 'npm run lint',
          packageManager: 'npm',
          status: 'passed',
          exitCode: 0,
          stdout: 'all good',
          stderr: '',
          durationMs: 5,
        },
      ],
      forensicGates: [],
      failuresPrevented: [],
      remainingRisks: ['typecheck failed'],
      pushRecommendation: 'DO_NOT_PUSH',
    })

    expect(rendered).toContain('stderr (tail):')
    expect(rendered).toContain('error TS2322: Type mismatch')
    expect(rendered).toContain('Sandbox runner unavailable')
    expect(rendered).not.toContain('all good')
  })

  it('truncates long output to the last lines with an omitted-lines marker', () => {
    const longOutput = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n')
    const rendered = renderPreflightReport({
      verdict: 'NEEDS_WORK',
      confidence: 25,
      changedFiles: [],
      validationCommands: [
        {
          script: 'test',
          command: 'npm run test',
          packageManager: 'npm',
          status: 'failed',
          exitCode: 1,
          stdout: longOutput,
          stderr: '',
          durationMs: 10,
        },
      ],
      forensicGates: [],
      failuresPrevented: [],
      remainingRisks: ['test failed'],
      pushRecommendation: 'DO_NOT_PUSH',
    })

    expect(rendered).toContain('earlier line(s) omitted')
    expect(rendered).toContain('line 39')
    expect(rendered).not.toContain('line 0\n')
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
