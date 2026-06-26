import { describe, expect, it } from 'vitest'

import {
  parseLintOutput,
  groupLintViolationsByFile,
  renderLintResult,
} from './lint-workflow.js'

describe('parseLintOutput', () => {
  it('returns passed for clean output', () => {
    const result = parseLintOutput('')
    expect(result.passed).toBe(true)
    expect(result.violations).toHaveLength(0)
    expect(result.summary).toContain('no issues')
  })

  it('parses eslint-style violations', () => {
    const output = [
      'src/utils.ts:10:5: error Missing semicolon [semi]',
      'src/utils.ts:20:3: warning Unexpected console statement [no-console]',
    ].join('\n')

    const result = parseLintOutput(output)

    expect(result.violations).toHaveLength(2)
    const v0 = result.violations[0]!
    const v1 = result.violations[1]!
    expect(v0.filePath).toBe('src/utils.ts')
    expect(v0.line).toBe(10)
    expect(v0.severity).toBe('error')
    expect(v0.ruleId).toBe('semi')
    expect(v1.severity).toBe('warning')
    expect(v1.ruleId).toBe('no-console')
  })

  it('detects error and warning counts from summary line', () => {
    const output = [
      '10 problems (5 errors, 5 warnings)',
    ].join('\n')

    const result = parseLintOutput(output)
    expect(result.errorCount).toBe(5)
    expect(result.warningCount).toBe(5)
    expect(result.passed).toBe(false)
  })

  it('marks as passed when only warnings', () => {
    const output = [
      'src/a.ts:1:1: warning unused var [no-unused-vars]',
    ].join('\n')

    const result = parseLintOutput(output)
    expect(result.passed).toBe(true)
    expect(result.warningCount).toBe(1)
  })

  it('detects fixable count', () => {
    const output = [
      '2 errors and 3 warnings potentially fixable',
    ].join('\n')

    const result = parseLintOutput(output)
    expect(result.fixableCount).toBe(5)
  })
})

describe('groupLintViolationsByFile', () => {
  it('groups violations by file', () => {
    const violations = [
      { filePath: 'src/a.ts', line: 1, column: 1, ruleId: 'r1', message: 'm1', severity: 'error' as const, fixable: false },
      { filePath: 'src/a.ts', line: 2, column: 1, ruleId: 'r2', message: 'm2', severity: 'error' as const, fixable: false },
      { filePath: 'src/b.ts', line: 1, column: 1, ruleId: 'r3', message: 'm3', severity: 'warning' as const, fixable: true },
    ]

    const grouped = groupLintViolationsByFile(violations)
    expect(grouped.get('src/a.ts')).toHaveLength(2)
    expect(grouped.get('src/b.ts')).toHaveLength(1)
  })

  it('uses "unknown" for empty file paths', () => {
    const violations = [
      { filePath: '', line: 1, column: 1, ruleId: 'r1', message: 'm1', severity: 'error' as const, fixable: false },
    ]

    const grouped = groupLintViolationsByFile(violations)
    expect(grouped.has('unknown')).toBe(true)
  })
})

describe('renderLintResult', () => {
  it('renders passing result', () => {
    const result = parseLintOutput('')
    const rendered = renderLintResult(result)

    expect(rendered).toContain('PASSED')
    expect(rendered).toContain('Errors: 0')
  })

  it('renders failing result with violations', () => {
    const output = 'src/utils.ts:10:5: error Missing semicolon [semi]'
    const result = parseLintOutput(output)
    const rendered = renderLintResult(result)

    expect(rendered).toContain('FAILED')
    expect(rendered).toContain('semi')
  })
})
