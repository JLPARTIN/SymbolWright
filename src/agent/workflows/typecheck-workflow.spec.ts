import { describe, expect, it } from 'vitest'

import {
  parseTypecheckOutput,
  groupTypecheckErrorsByFile,
  renderTypecheckResult,
} from './typecheck-workflow.js'

describe('parseTypecheckOutput', () => {
  it('returns passed for clean output', () => {
    const result = parseTypecheckOutput('')
    expect(result.passed).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.summary).toContain('passed')
  })

  it('parses TypeScript error lines', () => {
    const output = [
      'src/utils.ts(10,5): error TS2322: Type \'string\' is not assignable to type \'number\'.',
      'src/utils.ts(20,3): error TS2345: Argument of type \'null\' is not assignable to parameter of type \'string\'.',
    ].join('\n')

    const result = parseTypecheckOutput(output)

    expect(result.passed).toBe(false)
    expect(result.errors).toHaveLength(2)
    const err = result.errors[0]!
    expect(err.filePath).toBe('src/utils.ts')
    expect(err.line).toBe(10)
    expect(err.column).toBe(5)
    expect(err.code).toBe('TS2322')
    expect(err.message).toContain('not assignable')
  })

  it('counts errors correctly', () => {
    const output = [
      'src/a.ts(1,1): error TS1234: Error one.',
      'src/b.ts(2,2): error TS5678: Error two.',
      'src/c.ts(3,3): error TS9012: Error three.',
    ].join('\n')

    const result = parseTypecheckOutput(output)
    expect(result.errorCount).toBe(3)
    expect(result.summary).toContain('3 error(s)')
  })

  it('ignores non-error lines', () => {
    const output = [
      'Starting compilation...',
      'src/utils.ts(10,5): error TS2322: Type error.',
      'Compilation complete.',
    ].join('\n')

    const result = parseTypecheckOutput(output)
    expect(result.errors).toHaveLength(1)
  })
})

describe('groupTypecheckErrorsByFile', () => {
  it('groups errors by file path', () => {
    const errors = [
      { filePath: 'src/a.ts', line: 1, column: 1, code: 'TS1', message: 'e1' },
      { filePath: 'src/a.ts', line: 2, column: 1, code: 'TS2', message: 'e2' },
      { filePath: 'src/b.ts', line: 3, column: 1, code: 'TS3', message: 'e3' },
    ]

    const grouped = groupTypecheckErrorsByFile(errors)
    expect(grouped.get('src/a.ts')).toHaveLength(2)
    expect(grouped.get('src/b.ts')).toHaveLength(1)
  })

  it('returns empty map for no errors', () => {
    const grouped = groupTypecheckErrorsByFile([])
    expect(grouped.size).toBe(0)
  })
})

describe('renderTypecheckResult', () => {
  it('renders passing result', () => {
    const result = parseTypecheckOutput('')
    const rendered = renderTypecheckResult(result)

    expect(rendered).toContain('PASSED')
    expect(rendered).toContain('Errors: 0')
  })

  it('renders failing result with errors', () => {
    const output = 'src/utils.ts(10,5): error TS2322: Type error.'
    const result = parseTypecheckOutput(output)
    const rendered = renderTypecheckResult(result)

    expect(rendered).toContain('FAILED')
    expect(rendered).toContain('src/utils.ts')
    expect(rendered).toContain('TS2322')
  })
})
