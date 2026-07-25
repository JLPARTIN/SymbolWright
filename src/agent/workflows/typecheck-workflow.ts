export interface TypecheckError {
  readonly filePath: string
  readonly line: number
  readonly column: number
  readonly code: string
  readonly message: string
}

export interface TypecheckResult {
  readonly passed: boolean
  readonly errors: readonly TypecheckError[]
  readonly errorCount: number
  readonly summary: string
}

export function parseTypecheckOutput(output: string): TypecheckResult {
  const errors: TypecheckError[] = []
  const lines = output.split('\n')

  for (const line of lines) {
    const match = line.match(/^(.+)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/)
    if (
      match !== null &&
      match[1] !== undefined &&
      match[2] !== undefined &&
      match[3] !== undefined &&
      match[4] !== undefined &&
      match[5] !== undefined
    ) {
      errors.push({
        filePath: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        code: match[4],
        message: match[5],
      })
    }
  }

  const passed = errors.length === 0
  const summary = passed
    ? 'TypeScript compilation passed with no errors.'
    : `TypeScript compilation failed with ${errors.length} error(s).`

  return { passed, errors, errorCount: errors.length, summary }
}

export function groupTypecheckErrorsByFile(
  errors: readonly TypecheckError[],
): ReadonlyMap<string, readonly TypecheckError[]> {
  const grouped = new Map<string, TypecheckError[]>()

  for (const error of errors) {
    const existing = grouped.get(error.filePath)
    if (existing !== undefined) {
      existing.push(error)
    } else {
      grouped.set(error.filePath, [error])
    }
  }

  return grouped
}

export function renderTypecheckResult(result: TypecheckResult): string {
  const lines = [
    'SymbolWright Typecheck Workflow',
    '',
    `Status: ${result.passed ? 'PASSED' : 'FAILED'}`,
    `Errors: ${result.errorCount}`,
    '',
    result.summary,
  ]

  if (result.errors.length > 0) {
    lines.push('')
    const grouped = groupTypecheckErrorsByFile(result.errors)
    for (const [filePath, fileErrors] of grouped) {
      lines.push(`\n${filePath}:`)
      for (const error of fileErrors) {
        lines.push(`  Line ${error.line}: [${error.code}] ${error.message}`)
      }
    }
  }

  return lines.join('\n')
}
