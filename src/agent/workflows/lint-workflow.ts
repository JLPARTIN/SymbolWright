export interface LintViolation {
  readonly filePath: string
  readonly line: number
  readonly column: number
  readonly ruleId: string
  readonly message: string
  readonly severity: 'warning' | 'error'
  readonly fixable: boolean
}

export interface LintResult {
  readonly passed: boolean
  readonly violations: readonly LintViolation[]
  readonly warningCount: number
  readonly errorCount: number
  readonly fixableCount: number
  readonly summary: string
}

export function parseLintOutput(output: string): LintResult {
  const violations: LintViolation[] = []
  const lines = output.split('\n')

  for (const line of lines) {
    const match = line.match(/^\s*(\d+):(\d+)\s+(warning|error)\s+(.+?)\s{2,}(\S+)\s*$/)
    if (
      match !== null &&
      match[1] !== undefined &&
      match[2] !== undefined &&
      match[3] !== undefined &&
      match[4] !== undefined &&
      match[5] !== undefined
    ) {
      violations.push({
        filePath: '',
        line: parseInt(match[1], 10),
        column: parseInt(match[2], 10),
        severity: match[3] as 'warning' | 'error',
        message: match[4].trim(),
        ruleId: match[5],
        fixable: false,
      })
      continue
    }

    const eslintMatch = line.match(/^(.+):(\d+):(\d+):\s+(warning|error)\s+(.+?)\s+\[(.+)\]$/)
    if (
      eslintMatch !== null &&
      eslintMatch[1] !== undefined &&
      eslintMatch[2] !== undefined &&
      eslintMatch[3] !== undefined &&
      eslintMatch[4] !== undefined &&
      eslintMatch[5] !== undefined &&
      eslintMatch[6] !== undefined
    ) {
      violations.push({
        filePath: eslintMatch[1],
        line: parseInt(eslintMatch[2], 10),
        column: parseInt(eslintMatch[3], 10),
        severity: eslintMatch[4] as 'warning' | 'error',
        message: eslintMatch[5].trim(),
        ruleId: eslintMatch[6],
        fixable: false,
      })
    }
  }

  const summaryMatch = output.match(/(\d+)\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/)

  let warningCount = violations.filter((v) => v.severity === 'warning').length
  let errorCount = violations.filter((v) => v.severity === 'error').length

  if (summaryMatch !== null && summaryMatch[2] !== undefined && summaryMatch[3] !== undefined) {
    errorCount = parseInt(summaryMatch[2], 10)
    warningCount = parseInt(summaryMatch[3], 10)
  }

  const fixableMatch = output.match(
    /(\d+)\s+errors?\s+and\s+(\d+)\s+warnings?\s+potentially\s+fixable/,
  )
  const fixableCount =
    fixableMatch !== null && fixableMatch[1] !== undefined && fixableMatch[2] !== undefined
      ? parseInt(fixableMatch[1], 10) + parseInt(fixableMatch[2], 10)
      : 0

  const passed = errorCount === 0

  const summary = passed
    ? warningCount > 0
      ? `Lint passed with ${warningCount} warning(s).`
      : 'Lint passed with no issues.'
    : `Lint failed with ${errorCount} error(s) and ${warningCount} warning(s).`

  return {
    passed,
    violations,
    warningCount,
    errorCount,
    fixableCount,
    summary,
  }
}

export function groupLintViolationsByFile(
  violations: readonly LintViolation[],
): ReadonlyMap<string, readonly LintViolation[]> {
  const grouped = new Map<string, LintViolation[]>()

  for (const violation of violations) {
    const key = violation.filePath || 'unknown'
    const existing = grouped.get(key)
    if (existing !== undefined) {
      existing.push(violation)
    } else {
      grouped.set(key, [violation])
    }
  }

  return grouped
}

export function renderLintResult(result: LintResult): string {
  const lines = [
    'SymbolWright Lint Workflow',
    '',
    `Status: ${result.passed ? 'PASSED' : 'FAILED'}`,
    `Errors: ${result.errorCount}`,
    `Warnings: ${result.warningCount}`,
    `Fixable: ${result.fixableCount}`,
    '',
    result.summary,
  ]

  if (result.violations.length > 0) {
    lines.push('')
    const grouped = groupLintViolationsByFile(result.violations)
    for (const [filePath, fileViolations] of grouped) {
      lines.push(`\n${filePath}:`)
      for (const v of fileViolations) {
        lines.push(`  ${v.line}:${v.column} ${v.severity} [${v.ruleId}] ${v.message}`)
      }
    }
  }

  return lines.join('\n')
}
