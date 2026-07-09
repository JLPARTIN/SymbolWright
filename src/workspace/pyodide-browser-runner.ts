export const PYODIDE_BROWSER_RUNNER_ID = 'browser-pyodide' as const

export const PYODIDE_RUNTIME_BASE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/' as const

export const PYODIDE_BROWSER_RUNNER_LIMITS = {
  timeoutMs: 8_000,
  maxPythonChars: 32_000,
  maxOutputChars: 16_000,
} as const

export const PYODIDE_BROWSER_STARTER_SNIPPET = `def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("CodeMind"))`

export const PYODIDE_BROWSER_RUNNER_SAFETY = [
  'Runs through Pyodide in a browser Worker.',
  'Downloads the Pyodide browser runtime from the configured Pyodide distribution URL.',
  'Captures Python stdout and stderr inside the Worker.',
  'The Worker is terminated if it exceeds the configured timeout.',
  'No CodeMind server-side Python execution is exposed by this runner.',
] as const

export type PyodideBrowserRunStatus = 'success' | 'syntax-error' | 'runtime-error' | 'timeout'

export type PyodideBrowserRunResult = {
  ok: boolean
  status: PyodideBrowserRunStatus
  output: string
  errors: string[]
  durationMs: number
}

export function buildPyodideWorkerSource(): string {
  const limitsJson = JSON.stringify(PYODIDE_BROWSER_RUNNER_LIMITS)
  const baseUrl = PYODIDE_RUNTIME_BASE_URL

  return `
let pyodide = null;
const LIMITS = ${limitsJson};
const PYODIDE_BASE_URL = '${baseUrl}';

function limitText(value) {
  if (value.length <= LIMITS.maxOutputChars) return value;
  return value.slice(0, LIMITS.maxOutputChars) + '\\n[output truncated at ' + LIMITS.maxOutputChars + ' characters]';
}

async function loadRuntime() {
  if (pyodide !== null) return pyodide;
  importScripts(PYODIDE_BASE_URL + 'pyodide.js');
  pyodide = await loadPyodide({ indexURL: PYODIDE_BASE_URL });
  return pyodide;
}

self.onmessage = async (event) => {
  const startedAt = Date.now();
  const code = event.data && typeof event.data.code === 'string' ? event.data.code : '';

  if (code.trim().length === 0) {
    self.postMessage({
      ok: false,
      status: 'syntax-error',
      output: '',
      errors: ['Python input is empty.'],
      durationMs: Date.now() - startedAt,
    });
    return;
  }

  if (code.length > LIMITS.maxPythonChars) {
    self.postMessage({
      ok: false,
      status: 'runtime-error',
      output: '',
      errors: ['Python input exceeds ' + LIMITS.maxPythonChars + ' characters.'],
      durationMs: Date.now() - startedAt,
    });
    return;
  }

  let stdout = '';
  let stderr = '';

  try {
    const runtime = await loadRuntime();
    runtime.setStdout({ batched: (text) => { stdout += text + '\\n'; } });
    runtime.setStderr({ batched: (text) => { stderr += text + '\\n'; } });
    await runtime.runPythonAsync(code);
    self.postMessage({
      ok: true,
      status: 'success',
      output: limitText(stdout.trimEnd()),
      errors: stderr.trim().length > 0 ? [limitText(stderr.trimEnd())] : [],
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    const syntaxLike = message.includes('SyntaxError') || message.includes('IndentationError');
    self.postMessage({
      ok: false,
      status: syntaxLike ? 'syntax-error' : 'runtime-error',
      output: limitText(stdout.trimEnd()),
      errors: [limitText(message)],
      durationMs: Date.now() - startedAt,
    });
  }
};
`
}

export function createPyodideResultSummary(
  result: Pick<PyodideBrowserRunResult, 'ok' | 'status'>,
): string {
  return result.ok
    ? `Python executed successfully through ${PYODIDE_BROWSER_RUNNER_ID}.`
    : `Python execution failed with status ${result.status}.`
}
