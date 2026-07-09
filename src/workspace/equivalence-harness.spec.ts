import { describe, expect, it } from 'vitest'

import {
  CROSS_LANGUAGE_EQUIVALENCE_EXAMPLES,
  createEquivalenceHarnessSummary,
  evaluateEquivalenceOutputs,
} from './equivalence-harness.js'

describe('cross-language equivalence harness', () => {
  it('ships deterministic starter examples for translation checks', () => {
    expect(CROSS_LANGUAGE_EQUIVALENCE_EXAMPLES.map((example) => example.label)).toEqual([
      'Factorial',
      'Fibonacci',
      'Palindrome',
      'JSON transform',
      'Sort numbers',
      'String normalization',
    ])
  })

  it('creates a readable summary for CodeMind task context', () => {
    const summary = createEquivalenceHarnessSummary()

    expect(summary).toContain('Factorial: javascript -> typescript')
    expect(summary).toContain('String normalization: javascript -> typescript')
  })

  it('passes when observed outputs match expected outputs', () => {
    const result = evaluateEquivalenceOutputs('factorial-js-to-ts', [
      { testName: 'zero', actual: 1 },
      { testName: 'one', actual: 1 },
      { testName: 'five', actual: 120 },
    ])

    expect(result.status).toBe('PASS')
    expect(result.failed).toBe(0)
  })

  it('fails with findings when observed outputs drift', () => {
    const result = evaluateEquivalenceOutputs('sort-numbers-js-to-ts', [
      { testName: 'mixed', actual: [10, 1, 4, -2] },
      { testName: 'duplicates', actual: [1, 3, 3] },
    ])

    expect(result.status).toBe('FAIL')
    expect(result.findings.join('\n')).toContain('mixed')
  })
})
