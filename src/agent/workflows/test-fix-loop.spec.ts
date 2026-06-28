import { describe, expect, it } from 'vitest'

import {
  parseTestFailures,
  buildTestFixLoopResult,
  renderTestFixLoopResult,
  type TestRunResult,
  type TestFixIteration,
} from './test-fix-loop.js'

function makeTestResult(overrides: Partial<TestRunResult> = {}): TestRunResult {
  return {
    command: 'npm run test',
    passed: true,
    exitCode: 0,
    output: 'All tests passed.',
    failedTests: [],
    ...overrides,
  }
}

function makeIteration(
  iterationNumber: number,
  testResult: TestRunResult,
  filesEdited: readonly string[] = [],
): TestFixIteration {
  return {
    iterationNumber,
    testResult,
    ajnaReview: undefined,
    filesEdited,
  }
}

describe('parseTestFailures', () => {
  it('parses vitest FAIL lines', () => {
    const output = [
      ' FAIL  src/utils.spec.ts',
      '  Error: expected 1 to be 2',
      '',
      ' Test Files  1 failed (1)',
    ].join('\n')

    const failures = parseTestFailures(output)

    expect(failures.length).toBeGreaterThanOrEqual(1)
    expect(failures[0]!.filePath).toContain('utils.spec.ts')
  })

  it('returns empty for passing output', () => {
    const output = [' ✓ src/utils.spec.ts', ' Test Files  1 passed (1)'].join('\n')

    const failures = parseTestFailures(output)
    expect(failures).toHaveLength(0)
  })

  it('parses multiple failures', () => {
    const output = [
      ' FAIL  src/a.spec.ts',
      '  some error',
      ' FAIL  src/b.test.ts',
      '  another error',
      ' Test Files  2 failed (2)',
    ].join('\n')

    const failures = parseTestFailures(output)
    expect(failures.length).toBeGreaterThanOrEqual(2)
  })
})

describe('buildTestFixLoopResult', () => {
  it('returns TESTS_PASSED when first iteration passes', () => {
    const iterations = [makeIteration(1, makeTestResult())]
    const result = buildTestFixLoopResult(iterations, 3)

    expect(result.outcome).toBe('TESTS_PASSED')
    expect(result.totalIterations).toBe(1)
  })

  it('returns TESTS_FIXED when later iteration passes', () => {
    const iterations = [
      makeIteration(1, makeTestResult({ passed: false, exitCode: 1 }), ['src/a.ts']),
      makeIteration(2, makeTestResult()),
    ]
    const result = buildTestFixLoopResult(iterations, 3)

    expect(result.outcome).toBe('TESTS_FIXED')
    expect(result.totalIterations).toBe(2)
  })

  it('returns MAX_RETRIES when retries exhausted', () => {
    const iterations = [
      makeIteration(1, makeTestResult({ passed: false, exitCode: 1 })),
      makeIteration(2, makeTestResult({ passed: false, exitCode: 1 })),
      makeIteration(3, makeTestResult({ passed: false, exitCode: 1 })),
      makeIteration(4, makeTestResult({ passed: false, exitCode: 1 })),
    ]
    const result = buildTestFixLoopResult(iterations, 3)

    expect(result.outcome).toBe('MAX_RETRIES')
  })

  it('returns FIX_FAILED for empty iterations', () => {
    const result = buildTestFixLoopResult([], 3)

    expect(result.outcome).toBe('FIX_FAILED')
    expect(result.totalIterations).toBe(0)
  })

  it('returns FIX_FAILED when test still failing within retries', () => {
    const iterations = [
      makeIteration(1, makeTestResult({ passed: false, exitCode: 1 })),
      makeIteration(2, makeTestResult({ passed: false, exitCode: 1 })),
    ]
    const result = buildTestFixLoopResult(iterations, 3)

    expect(result.outcome).toBe('FIX_FAILED')
  })

  it('collects Ajna warnings from iterations', () => {
    const iterations: TestFixIteration[] = [
      {
        iterationNumber: 1,
        testResult: makeTestResult({ passed: false, exitCode: 1 }),
        ajnaReview: {
          triggered: true,
          riskLevel: 'HIGH',
          warning: 'Ajna detected HIGH risk',
          review: undefined,
        },
        filesEdited: ['src/a.ts'],
      },
      {
        iterationNumber: 2,
        testResult: makeTestResult({ passed: false, exitCode: 1 }),
        ajnaReview: undefined,
        filesEdited: [],
      },
    ]

    const result = buildTestFixLoopResult(iterations, 3)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toContain('Ajna detected HIGH risk')
  })
})

describe('renderTestFixLoopResult', () => {
  it('renders passed result', () => {
    const result = buildTestFixLoopResult([makeIteration(1, makeTestResult())], 3)
    const rendered = renderTestFixLoopResult(result)

    expect(rendered).toContain('TESTS_PASSED')
    expect(rendered).toContain('PASSED')
  })

  it('renders failed test names', () => {
    const result = buildTestFixLoopResult(
      [
        makeIteration(
          1,
          makeTestResult({
            passed: false,
            exitCode: 1,
            failedTests: [
              {
                testName: 'should add numbers',
                filePath: 'src/math.spec.ts',
                error: 'expected 3 to be 4',
              },
            ],
          }),
        ),
      ],
      3,
    )
    const rendered = renderTestFixLoopResult(result)

    expect(rendered).toContain('Failed tests')
    expect(rendered).toContain('should add numbers')
  })
})
