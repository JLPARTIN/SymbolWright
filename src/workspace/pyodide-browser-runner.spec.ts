import { describe, expect, it } from 'vitest'

import {
  PYODIDE_BROWSER_RUNNER_ID,
  PYODIDE_BROWSER_RUNNER_LIMITS,
  PYODIDE_BROWSER_RUNNER_SAFETY,
  PYODIDE_BROWSER_STARTER_SNIPPET,
  PYODIDE_RUNTIME_BASE_URL,
  buildPyodideWorkerSource,
  createPyodideResultSummary,
} from './pyodide-browser-runner.js'

describe('Pyodide browser runner contract', () => {
  it('declares a real Pyodide browser runner id, runtime URL, and starter snippet', () => {
    expect(PYODIDE_BROWSER_RUNNER_ID).toBe('browser-pyodide')
    expect(PYODIDE_RUNTIME_BASE_URL).toContain('pyodide')
    expect(PYODIDE_BROWSER_STARTER_SNIPPET).toContain('def greet')
    expect(PYODIDE_BROWSER_RUNNER_SAFETY.join('\n')).toContain('Pyodide')
  })

  it('builds a Worker source that loads and executes Pyodide', () => {
    const source = buildPyodideWorkerSource()

    expect(source).toContain('importScripts(PYODIDE_BASE_URL')
    expect(source).toContain('loadPyodide({ indexURL: PYODIDE_BASE_URL })')
    expect(source).toContain('runtime.setStdout')
    expect(source).toContain('runtime.setStderr')
    expect(source).toContain('runtime.runPythonAsync(code)')
    expect(source).toContain(String(PYODIDE_BROWSER_RUNNER_LIMITS.timeoutMs))
  })

  it('classifies syntax-like failures and enforces code/output limits in the Worker source', () => {
    const source = buildPyodideWorkerSource()

    expect(source).toContain('Python input is empty.')
    expect(source).toContain('Python input exceeds')
    expect(source).toContain('SyntaxError')
    expect(source).toContain('IndentationError')
    expect(source).toContain('[output truncated at')
  })

  it('summarizes Pyodide execution results for the workspace output panel', () => {
    expect(createPyodideResultSummary({ ok: true, status: 'success' })).toBe(
      'Python executed successfully through browser-pyodide.',
    )
    expect(createPyodideResultSummary({ ok: false, status: 'runtime-error' })).toBe(
      'Python execution failed with status runtime-error.',
    )
  })
})
