import type { CodemindChangedFileContext } from '../../repo-context/repo-context.types.js'
import { runAjnaPostEditHook } from '../hooks/ajna-post-edit-hook.js'
import type { AjnaPostEditContext, AjnaPostEditResult } from '../hooks/ajna-post-edit-hook.js'

export type TestFixOutcome = 'TESTS_PASSED' | 'TESTS_FIXED' | 'FIX_FAILED' | 'MAX_RETRIES'

export interface TestRunResult {
  readonly command: string
  readonly passed: boolean
  readonly exitCode: number
  readonly output: string
  readonly failedTests: readonly TestFailure[]
}

export interface TestFailure {
  readonly testName: string
  readonly filePath: string
  readonly error: string
}

export interface TestFixIteration {
  readonly iterationNumber: number
  readonly testResult: TestRunResult
  readonly ajnaReview: AjnaPostEditResult | undefined
  readonly filesEdited: readonly string[]
}

export interface TestFixLoopConfig {
  readonly maxRetries: number
  readonly testCommand: string
  readonly ajnaContext: AjnaPostEditContext
}

export interface TestFixLoopResult {
  readonly outcome: TestFixOutcome
  readonly iterations: readonly TestFixIteration[]
  readonly totalIterations: number
  readonly finalTestResult: TestRunResult
  readonly warnings: readonly string[]
}

export function parseTestFailures(output: string): readonly TestFailure[] {
  const failures: TestFailure[] = []
  const lines = output.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string

    const failMatch = line.match(/FAIL\s+(.+\.(?:spec|test)\.[jt]sx?)/)
    if (failMatch !== null && failMatch[1] !== undefined) {
      const filePath = failMatch[1].trim()
      const errorLines: string[] = []

      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const nextLine = lines[j] as string
        if (nextLine.match(/FAIL\s+/) !== null || nextLine.match(/Test Files/) !== null) break
        if (nextLine.trim().length > 0) errorLines.push(nextLine.trim())
      }

      failures.push({
        testName: filePath,
        filePath,
        error: errorLines.join('\n'),
      })
    }

    const vitestFailMatch = line.match(/×\s+(.+)/)
    if (vitestFailMatch !== null && vitestFailMatch[1] !== undefined) {
      const testName = vitestFailMatch[1].trim()
      const errorLines: string[] = []

      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const nextLine = lines[j] as string
        if (nextLine.includes('×') || nextLine.includes('✓') || nextLine.includes('√')) break
        if (nextLine.trim().length > 0) errorLines.push(nextLine.trim())
      }

      failures.push({
        testName,
        filePath: '',
        error: errorLines.join('\n'),
      })
    }
  }

  return failures
}

export function buildTestFixLoopResult(
  iterations: readonly TestFixIteration[],
  maxRetries: number,
): TestFixLoopResult {
  const warnings: string[] = []

  if (iterations.length === 0) {
    return {
      outcome: 'FIX_FAILED',
      iterations: [],
      totalIterations: 0,
      finalTestResult: {
        command: '',
        passed: false,
        exitCode: 1,
        output: '',
        failedTests: [],
      },
      warnings: ['No iterations executed.'],
    }
  }

  const lastIteration = iterations[iterations.length - 1] as TestFixIteration
  const finalTestResult = lastIteration.testResult

  if (iterations.length === 1 && finalTestResult.passed) {
    return {
      outcome: 'TESTS_PASSED',
      iterations,
      totalIterations: 1,
      finalTestResult,
      warnings,
    }
  }

  if (finalTestResult.passed && iterations.length > 1) {
    return {
      outcome: 'TESTS_FIXED',
      iterations,
      totalIterations: iterations.length,
      finalTestResult,
      warnings,
    }
  }

  for (const iter of iterations) {
    if (iter.ajnaReview !== undefined && iter.ajnaReview.warning !== undefined) {
      warnings.push(`Iteration ${iter.iterationNumber}: ${iter.ajnaReview.warning}`)
    }
  }

  if (iterations.length > maxRetries) {
    return {
      outcome: 'MAX_RETRIES',
      iterations,
      totalIterations: iterations.length,
      finalTestResult,
      warnings,
    }
  }

  return {
    outcome: 'FIX_FAILED',
    iterations,
    totalIterations: iterations.length,
    finalTestResult,
    warnings,
  }
}

export function renderTestFixLoopResult(result: TestFixLoopResult): string {
  const lines = [
    'CodeMind Test-Fix Loop',
    '',
    `Outcome: ${result.outcome}`,
    `Iterations: ${result.totalIterations}`,
    `Final test status: ${result.finalTestResult.passed ? 'PASSED' : 'FAILED'}`,
  ]

  if (result.finalTestResult.failedTests.length > 0) {
    lines.push('')
    lines.push('Failed tests:')
    for (const failure of result.finalTestResult.failedTests) {
      lines.push(`  - ${failure.testName}: ${failure.error.substring(0, 100)}`)
    }
  }

  if (result.warnings.length > 0) {
    lines.push('')
    lines.push('Warnings:')
    for (const warning of result.warnings) {
      lines.push(`  - ${warning}`)
    }
  }

  return lines.join('\n')
}
