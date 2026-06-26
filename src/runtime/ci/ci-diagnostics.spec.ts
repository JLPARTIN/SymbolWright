import { describe, expect, it } from 'vitest'

import {
  analyzeCiOutput,
  renderCiDiagnosticReport,
} from './ci-diagnostics.js'

describe('analyzeCiOutput', () => {
  it('reports no issues for clean exit', () => {
    const report = analyzeCiOutput('npm run typecheck', 0, 'OK', '')

    expect(report.findings).toHaveLength(0)
    expect(report.summary).toContain('passed with no issues')
  })

  it('detects TypeScript compilation errors', () => {
    const stderr = 'src/foo.ts(1,1): error TS2304: Cannot find name "x".'
    const report = analyzeCiOutput('npm run typecheck', 1, '', stderr)

    expect(report.findings.length).toBeGreaterThan(0)
    expect(report.findings.some((f) => f.source === 'typecheck')).toBe(true)
    expect(report.summary).toContain('failed')
  })

  it('detects missing module errors', () => {
    const stderr = "Cannot find module './missing.js'"
    const report = analyzeCiOutput('npm run typecheck', 1, '', stderr)

    expect(report.findings.some((f) => f.message.includes('Missing module'))).toBe(true)
  })

  it('detects test failures', () => {
    const stdout = 'FAIL src/foo.spec.ts\n  ✕ should pass'
    const report = analyzeCiOutput('npm test', 1, stdout, '')

    expect(report.findings.some((f) => f.source === 'test')).toBe(true)
    expect(report.summary).toContain('failed')
  })

  it('detects lint errors', () => {
    const stdout = '10 problems (5 errors, 5 warnings)\n@typescript-eslint/no-unused-vars'
    const report = analyzeCiOutput('npm run lint', 1, stdout, '')

    expect(report.findings.some((f) => f.source === 'lint')).toBe(true)
  })

  it('detects audit vulnerabilities', () => {
    const stdout = 'found 3 vulnerabilities (1 high, 2 moderate)'
    const report = analyzeCiOutput('npm run audit', 1, stdout, '')

    expect(report.findings.some((f) => f.source === 'audit')).toBe(true)
  })

  it('reports unknown failure when no patterns match', () => {
    const report = analyzeCiOutput('npm run build', 1, '', 'something weird happened')

    expect(report.findings).toHaveLength(1)
    expect(report.findings[0]!.source).toBe('unknown')
    expect(report.findings[0]!.message).toContain('no specific pattern matched')
  })

  it('deduplicates findings from the same source', () => {
    const stderr = 'error TS2304: x\nerror TS2304: y\nerror TS2304: z'
    const report = analyzeCiOutput('npm run typecheck', 1, '', stderr)

    const typecheckFindings = report.findings.filter((f) => f.source === 'typecheck')
    expect(typecheckFindings.length).toBeLessThanOrEqual(2)
  })

  it('includes suggested fixes', () => {
    const stderr = 'src/foo.ts(1,1): error TS2304: Cannot find name "x".'
    const report = analyzeCiOutput('npm run typecheck', 1, '', stderr)

    expect(report.findings.some((f) => f.suggestedFix !== undefined)).toBe(true)
  })

  it('reports warnings for successful exit with warnings', () => {
    const stdout = 'found 1 vulnerabilities\nno-unused-vars'
    const report = analyzeCiOutput('npm run lint', 0, stdout, '')

    expect(report.summary).toContain('passed with')
    expect(report.summary).toContain('warning')
  })
})

describe('renderCiDiagnosticReport', () => {
  it('renders a clean report', () => {
    const report = analyzeCiOutput('npm run typecheck', 0, 'OK', '')
    const output = renderCiDiagnosticReport(report)

    expect(output).toContain('CodeMind CI Diagnostics')
    expect(output).toContain('Exit code: 0')
    expect(output).toContain('No issues detected.')
  })

  it('renders findings with suggested fixes', () => {
    const stderr = 'src/foo.ts(1,1): error TS2304: Cannot find name "x".'
    const report = analyzeCiOutput('npm run typecheck', 1, '', stderr)
    const output = renderCiDiagnosticReport(report)

    expect(output).toContain('[ERROR]')
    expect(output).toContain('Fix:')
    expect(output).toContain('typecheck')
  })

  it('renders exit code and summary', () => {
    const report = analyzeCiOutput('npm test', 1, 'FAIL src/a.spec.ts', '')
    const output = renderCiDiagnosticReport(report)

    expect(output).toContain('Exit code: 1')
    expect(output).toContain('failed')
  })
})
