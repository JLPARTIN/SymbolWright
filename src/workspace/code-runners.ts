import { Buffer } from 'node:buffer'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import vm from 'node:vm'

import {
  findLanguageDefinition,
  type CodeLanguageCapability,
  type CodeRunnerId,
} from './language-registry.js'

export type CodeRunStatus = 'success' | 'syntax-error' | 'runtime-error' | 'timeout' | 'unsupported'

export type CodeRunRequest = {
  languageId: string
  code: string
  timeoutMs?: number
  maxOutputBytes?: number
}

export type CodeRunResult = {
  ok: boolean
  status: CodeRunStatus
  capability: CodeLanguageCapability
  output: string
  errors: string[]
  diagnostics: string[]
  durationMs: number
  runnerId?: CodeRunnerId
}

type ConsoleWrite = (...values: unknown[]) => void

const DEFAULT_TIMEOUT_MS = 1_500
const DEFAULT_MAX_OUTPUT_BYTES = 16_384
const MAX_CODE_BYTES = 64_000

export function buildBrowserJavaScriptWorkerSource(code: string): string {
  return `
const __logs = [];
const __format = (value) => {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch (_error) { return String(value); }
};
const console = {
  log: (...values) => __logs.push(values.map(__format).join(' ')),
  error: (...values) => __logs.push(values.map(__format).join(' ')),
  warn: (...values) => __logs.push(values.map(__format).join(' ')),
};
const fetch = undefined;
const XMLHttpRequest = undefined;
const importScripts = undefined;
try {
${code}
  postMessage({ ok: true, output: __logs.join('\\n'), errors: [] });
} catch (error) {
  postMessage({ ok: false, output: __logs.join('\\n'), errors: [error && error.stack ? error.stack : String(error)] });
}
`
}

export function buildHtmlPreviewDocument(code: string): string {
  return code
}

export async function runServerCode(request: CodeRunRequest): Promise<CodeRunResult> {
  const startedAt = Date.now()
  const language = findLanguageDefinition(request.languageId)

  if (language === undefined) {
    return createRunResult({
      ok: false,
      status: 'unsupported',
      capability: 'not-yet-supported',
      output: '',
      errors: [`Unsupported language id: ${request.languageId}`],
      diagnostics: [],
      durationMs: Date.now() - startedAt,
    })
  }

  if (language.capability !== 'server-run' || language.runnerId !== 'server-typescript-node') {
    return createRunResult({
      ok: false,
      status: 'unsupported',
      capability: language.capability,
      runnerId: language.runnerId,
      output: '',
      errors: [
        `${language.label} is ${language.capability}; it is not handled by the server runner.`,
      ],
      diagnostics: language.safetyRestrictions,
      durationMs: Date.now() - startedAt,
    })
  }

  const timeoutMs = sanitizeLimit(request.timeoutMs, DEFAULT_TIMEOUT_MS, 100, 10_000)
  const maxOutputBytes = sanitizeLimit(
    request.maxOutputBytes,
    DEFAULT_MAX_OUTPUT_BYTES,
    1_024,
    128_000,
  )
  const codeBytes = Buffer.byteLength(request.code, 'utf8')

  if (codeBytes > MAX_CODE_BYTES) {
    return createRunResult({
      ok: false,
      status: 'unsupported',
      capability: language.capability,
      runnerId: language.runnerId,
      output: '',
      errors: [`Code input is too large: ${codeBytes} bytes exceeds ${MAX_CODE_BYTES} bytes.`],
      diagnostics: language.safetyRestrictions,
      durationMs: Date.now() - startedAt,
    })
  }

  const workspace = await createTemporaryWorkspace()

  try {
    const inputPath = assertInsideWorkspace(workspace, join(workspace, 'input.ts'))
    await writeFile(inputPath, request.code, 'utf8')

    const transpiled = await transpileTypeScript(request.code)
    if (!transpiled.ok) {
      return createRunResult({
        ok: false,
        status: 'syntax-error',
        capability: language.capability,
        runnerId: language.runnerId,
        output: '',
        errors: transpiled.errors,
        diagnostics: [...language.safetyRestrictions, ...transpiled.diagnostics],
        durationMs: Date.now() - startedAt,
      })
    }

    const compiledPath = assertInsideWorkspace(workspace, join(workspace, 'compiled.js'))
    await writeFile(compiledPath, transpiled.outputText, 'utf8')

    const execution = executeJavaScriptInVm(transpiled.outputText, timeoutMs, maxOutputBytes)

    return createRunResult({
      ok: execution.ok,
      status: execution.status,
      capability: language.capability,
      runnerId: language.runnerId,
      output: execution.output,
      errors: execution.errors,
      diagnostics: [...language.safetyRestrictions, ...transpiled.diagnostics],
      durationMs: Date.now() - startedAt,
    })
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

function sanitizeLimit(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.trunc(value)))
}

async function createTemporaryWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), 'codemind-run-'))
  return resolve(workspace)
}

function assertInsideWorkspace(workspace: string, targetPath: string): string {
  const resolvedWorkspace = resolve(workspace)
  const resolvedTarget = resolve(targetPath)
  const relation = relative(resolvedWorkspace, resolvedTarget)

  if (
    relation.startsWith('..') ||
    relation === '' ||
    resolve(resolvedWorkspace, relation) !== resolvedTarget
  ) {
    if (resolvedTarget !== resolvedWorkspace) {
      throw new Error(`Runner path escapes temporary workspace: ${targetPath}`)
    }
  }

  return resolvedTarget
}

async function transpileTypeScript(
  code: string,
): Promise<
  | { ok: true; outputText: string; diagnostics: string[] }
  | { ok: false; errors: string[]; diagnostics: string[] }
> {
  try {
    const ts = await import('typescript')
    const result = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        strict: true,
        esModuleInterop: true,
      },
      reportDiagnostics: true,
    })

    const diagnostics = (result.diagnostics ?? []).map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    )
    const errors = (result.diagnostics ?? [])
      .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))

    if (errors.length > 0) {
      return { ok: false, errors, diagnostics }
    }

    return { ok: true, outputText: result.outputText, diagnostics }
  } catch (error: unknown) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
      diagnostics: ['TypeScript compiler dependency could not be loaded.'],
    }
  }
}

function executeJavaScriptInVm(
  compiledJavaScript: string,
  timeoutMs: number,
  maxOutputBytes: number,
): Pick<CodeRunResult, 'ok' | 'status' | 'output' | 'errors'> {
  const logs: string[] = []
  const appendLog: ConsoleWrite = (...values) => {
    logs.push(values.map(formatConsoleValue).join(' '))
  }

  const blocked = (): never => {
    throw new Error('This API is disabled inside the CodeMind workspace runner.')
  }

  const context = vm.createContext({
    console: {
      log: appendLog,
      info: appendLog,
      warn: appendLog,
      error: appendLog,
    },
    exports: {},
    module: { exports: {} },
    require: blocked,
    process: undefined,
    Buffer: undefined,
    fetch: undefined,
    setTimeout: undefined,
    setInterval: undefined,
    clearTimeout: undefined,
    clearInterval: undefined,
  })

  try {
    const script = new vm.Script(compiledJavaScript, {
      filename: 'codemind-workspace-runner.js',
    })
    script.runInContext(context, { timeout: timeoutMs })

    return {
      ok: true,
      status: 'success',
      output: limitOutput(logs.join('\n'), maxOutputBytes),
      errors: [],
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    const isTimeout = message.includes('Script execution timed out')

    return {
      ok: false,
      status: isTimeout ? 'timeout' : 'runtime-error',
      output: limitOutput(logs.join('\n'), maxOutputBytes),
      errors: [error instanceof Error && error.stack !== undefined ? error.stack : message],
    }
  }
}

function formatConsoleValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch (_error: unknown) {
    return String(value)
  }
}

function limitOutput(value: string, maxOutputBytes: number): string {
  const buffer = Buffer.from(value, 'utf8')

  if (buffer.length <= maxOutputBytes) {
    return value
  }

  return `${buffer.subarray(0, maxOutputBytes).toString('utf8')}\n[output truncated at ${maxOutputBytes} bytes]`
}

function createRunResult(
  input: Omit<CodeRunResult, 'runnerId'> & {
    runnerId?: CodeRunnerId | undefined
  },
): CodeRunResult {
  if (input.runnerId === undefined) {
    const { runnerId: _runnerId, ...result } = input
    return result
  }

  return input as CodeRunResult
}
