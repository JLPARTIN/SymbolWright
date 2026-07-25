export type CiDiagnosticSeverity = 'error' | 'warning' | 'info'

export interface CiDiagnosticFinding {
  readonly severity: CiDiagnosticSeverity
  readonly source: string
  readonly message: string
  readonly suggestedFix: string | undefined
}

export interface CiDiagnosticReport {
  readonly command: string
  readonly exitCode: number
  readonly findings: readonly CiDiagnosticFinding[]
  readonly summary: string
  readonly analyzedAt: string
}

interface DiagnosticPattern {
  readonly pattern: RegExp
  readonly severity: CiDiagnosticSeverity
  readonly source: string
  readonly message: string
  readonly suggestedFix: string
}

const DIAGNOSTIC_PATTERNS: readonly DiagnosticPattern[] = [
  {
    pattern: /error TS\d+:/,
    severity: 'error',
    source: 'typecheck',
    message: 'TypeScript compilation error detected',
    suggestedFix: 'Fix type errors reported by tsc and re-run npm run typecheck',
  },
  {
    pattern: /Cannot find module/,
    severity: 'error',
    source: 'typecheck',
    message: 'Missing module import detected',
    suggestedFix: 'Check import paths and ensure the module is installed or the path is correct',
  },
  {
    pattern: /FAIL\s+\S+\.spec\./,
    severity: 'error',
    source: 'test',
    message: 'Test failure detected',
    suggestedFix: 'Fix failing tests and re-run npm test',
  },
  {
    pattern: /AssertionError|expect\(received\)/,
    severity: 'error',
    source: 'test',
    message: 'Test assertion failure',
    suggestedFix: 'Review test expectations against actual behavior',
  },
  {
    pattern: /✕|×|FAILED/,
    severity: 'error',
    source: 'test',
    message: 'Test failure indicator detected',
    suggestedFix: 'Fix failing tests and re-run',
  },
  {
    pattern: /no-unused-vars|@typescript-eslint/,
    severity: 'warning',
    source: 'lint',
    message: 'ESLint rule violation detected',
    suggestedFix: 'Fix lint issues or run npm run lint:fix',
  },
  {
    pattern: /\d+ problems? \(\d+ errors?/,
    severity: 'error',
    source: 'lint',
    message: 'ESLint reported errors',
    suggestedFix: 'Fix lint errors and re-run npm run lint',
  },
  {
    pattern: /found \d+ vulnerabilit/,
    severity: 'warning',
    source: 'audit',
    message: 'npm audit found vulnerabilities',
    suggestedFix: 'Run npm audit fix or review and address reported vulnerabilities',
  },
  {
    pattern: /high|critical/i,
    severity: 'error',
    source: 'audit',
    message: 'High or critical vulnerability detected',
    suggestedFix: 'Address high/critical vulnerabilities before proceeding',
  },
  {
    pattern: /ERR_MODULE_NOT_FOUND/,
    severity: 'error',
    source: 'build',
    message: 'Module resolution error during build',
    suggestedFix: 'Check module paths and tsconfig settings',
  },
  {
    pattern: /ENOENT|no such file/,
    severity: 'error',
    source: 'build',
    message: 'File not found during build',
    suggestedFix: 'Verify file paths and ensure all referenced files exist',
  },
]

export function analyzeCiOutput(
  command: string,
  exitCode: number,
  stdout: string,
  stderr: string,
): CiDiagnosticReport {
  const combined = `${stdout}\n${stderr}`
  const findings: CiDiagnosticFinding[] = []
  const seen = new Set<string>()

  for (const diagnostic of DIAGNOSTIC_PATTERNS) {
    if (diagnostic.pattern.test(combined)) {
      const key = `${diagnostic.source}:${diagnostic.message}`
      if (!seen.has(key)) {
        seen.add(key)
        findings.push({
          severity: diagnostic.severity,
          source: diagnostic.source,
          message: diagnostic.message,
          suggestedFix: diagnostic.suggestedFix,
        })
      }
    }
  }

  if (exitCode !== 0 && findings.length === 0) {
    findings.push({
      severity: 'error',
      source: 'unknown',
      message: `Command exited with code ${exitCode} but no specific pattern matched`,
      suggestedFix: 'Review stdout/stderr output for error details',
    })
  }

  const errorCount = findings.filter((f) => f.severity === 'error').length
  const warningCount = findings.filter((f) => f.severity === 'warning').length

  let summary: string
  if (exitCode === 0 && findings.length === 0) {
    summary = `${command} passed with no issues`
  } else if (exitCode === 0) {
    summary = `${command} passed with ${warningCount} warning(s)`
  } else {
    summary = `${command} failed with ${errorCount} error(s) and ${warningCount} warning(s)`
  }

  return {
    command,
    exitCode,
    findings,
    summary,
    analyzedAt: new Date().toISOString(),
  }
}

export function renderCiDiagnosticReport(report: CiDiagnosticReport): string {
  const lines = [
    'SymbolWright CI Diagnostics',
    '',
    `Command: ${report.command}`,
    `Exit code: ${report.exitCode}`,
    `Summary: ${report.summary}`,
    `Analyzed: ${report.analyzedAt}`,
  ]

  if (report.findings.length > 0) {
    lines.push('', 'Findings:')
    for (const finding of report.findings) {
      lines.push(`  [${finding.severity.toUpperCase()}] (${finding.source}) ${finding.message}`)
      if (finding.suggestedFix !== undefined) {
        lines.push(`    Fix: ${finding.suggestedFix}`)
      }
    }
  } else {
    lines.push('', 'No issues detected.')
  }

  return lines.join('\n')
}
