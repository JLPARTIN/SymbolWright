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

  it('creates a readable summary for SymbolWright task context', () => {
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

  it('returns UNVERIFIED for unknown example ids', () => {
    const result = evaluateEquivalenceOutputs('missing-example', [])

    expect(result.status).toBe('UNVERIFIED')
    expect(result.findings).toEqual(['Unknown equivalence example: missing-example'])
  })

  it('fails when an expected test output is missing', () => {
    const result = evaluateEquivalenceOutputs('factorial-js-to-ts', [
      { testName: 'zero', actual: 1 },
      { testName: 'one', actual: 1 },
    ])

    expect(result.status).toBe('FAIL')
    expect(result.findings.join('\n')).toContain('five: missing observed output')
  })

  it('canonicalizes nested object keys before comparing expected and observed outputs', () => {
    const result = evaluateEquivalenceOutputs('json-transform-js-to-ts', [
      { testName: 'mixed users', actual: ['Ada', 'Zoe'] },
    ])
    const objectResult = evaluateEquivalenceOutputs('sort-numbers-js-to-ts', [
      { testName: 'mixed', actual: [-2, 1, 4, 10] },
      { testName: 'duplicates', actual: [1, 3, 3] },
    ])

    expect(result.status).toBe('PASS')
    expect(objectResult.status).toBe('PASS')
  })
})
