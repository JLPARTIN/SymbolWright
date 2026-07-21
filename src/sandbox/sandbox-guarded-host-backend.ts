import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type {
  SandboxDiagnostic,
  SandboxExecutionRequest,
  SandboxExecutionResult,
  SandboxExecutionStatus,
  SandboxLimits,
  SandboxRunnerDefinition,
  VerificationLevel,
} from './sandbox-types.js'

export interface GuardedHostExecutionController {
  readonly executionId: string
  readonly completed: Promise<SandboxExecutionResult>
  cancel: () => void
}

export interface GuardedHostExecutionOptions {
  readonly executionId: string
  readonly request: SandboxExecutionRequest
  readonly runner: SandboxRunnerDefinition
  readonly startedAt: string
  readonly now: () => Date
  readonly env: NodeJS.ProcessEnv
  readonly onStart?: (controller: GuardedHostExecutionController) => void
}

interface MaterializedWorkspace {
  readonly root: string
  readonly entryPath: string
  readonly cleanup: () => Promise<SandboxExecutionResult['cleanup']>
}

interface PlannedCommand {
  readonly phase: 'compile' | 'run' | 'test'
  readonly command: string
  readonly args: readonly string[]
  readonly env?: Record<string, string>
}

interface ProcessOutcome {
  readonly phase: PlannedCommand['phase']
  readonly exitCode?: number
  readonly signal?: string
  readonly stdout: string
  readonly stderr: string
  readonly timedOut: boolean
  readonly cancelled: boolean
  readonly truncated: boolean
}

interface MutableExecutionState {
  child?: ChildProcessWithoutNullStreams
  cancelRequested: boolean
}

const DEFAULT_FILE_BY_LANGUAGE = new Map<string, string>([
  ['javascript', 'main.js'],
  ['typescript', 'main.ts'],
  ['python', 'main.py'],
  ['go', 'main.go'],
  ['rust', 'main.rs'],
  ['java', 'Main.java'],
  ['c', 'main.c'],
  ['cpp', 'main.cpp'],
  ['ruby', 'main.rb'],
  ['php', 'main.php'],
])

const EXTENSIONS_BY_LANGUAGE = new Map<string, readonly string[]>([
  ['javascript', ['.js', '.mjs', '.cjs']],
  ['typescript', ['.ts', '.tsx']],
  ['python', ['.py']],
  ['go', ['.go']],
  ['rust', ['.rs']],
  ['java', ['.java']],
  ['c', ['.c']],
  ['cpp', ['.cpp', '.cc', '.cxx']],
  ['ruby', ['.rb']],
  ['php', ['.php']],
])

const VERIFICATION_BY_MODE = new Map<SandboxExecutionRequest['mode'], VerificationLevel>([
  ['run', 'EXECUTED'],
  ['compile', 'COMPILED'],
  ['test', 'TESTED'],
])

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function entryNameFor(languageId: string): string {
  const fileName = DEFAULT_FILE_BY_LANGUAGE.get(languageId)
  if (fileName === undefined) throw new Error(`No guarded-host entrypoint for ${languageId}`)
  return fileName
}

function normalizeRelativePath(filePath: string): string {
  const normalized = path.posix.normalize(filePath.replace(/\\/g, '/'))
  if (
    normalized.length === 0 ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    path.isAbsolute(normalized)
  ) {
    throw new Error('Sandbox file path escaped temporary workspace')
  }
  return normalized
}

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child)
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function findEntryFile(languageId: string, files: readonly { readonly path: string }[]): string {
  const extensions = EXTENSIONS_BY_LANGUAGE.get(languageId) ?? []
  const match = files.find((file) => extensions.some((extension) => file.path.endsWith(extension)))
  return match?.path ?? files[0]?.path ?? entryNameFor(languageId)
}

async function materializeWorkspace(request: SandboxExecutionRequest): Promise<MaterializedWorkspace> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'codemind-sandbox-'))
  let entryPath = path.join(root, entryNameFor(request.languageId))
  const cleanup = async (): Promise<SandboxExecutionResult['cleanup']> => {
    try {
      await rm(root, { recursive: true, force: true })
      return { attempted: true, succeeded: true }
    } catch (error) {
      return {
        attempted: true,
        succeeded: false,
        warning: error instanceof Error ? error.message : String(error),
      }
    }
  }

  if (request.source !== undefined) {
    await writeFile(entryPath, request.source, 'utf8')
    return { root, entryPath, cleanup }
  }

  if (request.files !== undefined) {
    const entryRelativePath = findEntryFile(request.languageId, request.files)
    for (const file of request.files) {
      const relativePath = normalizeRelativePath(file.path)
      const target = path.join(root, relativePath)
      if (!isInside(target, root)) throw new Error('Sandbox file path escaped temporary workspace')
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, file.content, 'utf8')
    }
    entryPath = path.join(root, normalizeRelativePath(entryRelativePath))
    return { root, entryPath, cleanup }
  }

  if (request.repository !== undefined) {
    const repositoryRoot = path.resolve(request.repository.rootPath)
    const selectedPath = request.repository.selectedPaths?.[0]
    if (selectedPath === undefined) throw new Error('repository.selectedPaths requires one target file')
    const normalizedSelected = normalizeRelativePath(selectedPath)
    const sourcePath = path.resolve(repositoryRoot, normalizedSelected)
    if (!isInside(sourcePath, repositoryRoot)) throw new Error('Repository target escaped root')
    const content = await readFile(sourcePath, 'utf8')
    const target = path.join(root, normalizedSelected)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content, 'utf8')
    entryPath = target
    return { root, entryPath, cleanup }
  }

  throw new Error('Sandbox request had no materialized source')
}

function minimalEnvironment(
  baseEnv: NodeJS.ProcessEnv,
  workspaceRoot: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  const env: Record<string, string> = {
    PATH: baseEnv['PATH'] ?? process.env['PATH'] ?? '',
    TMPDIR: workspaceRoot,
    TEMP: workspaceRoot,
    TMP: workspaceRoot,
    XDG_CACHE_HOME: path.join(workspaceRoot, '.cache'),
    GOCACHE: path.join(workspaceRoot, '.cache', 'go-build'),
    GO111MODULE: 'off',
    ...extra,
  }
  for (const key of ['SystemRoot', 'WINDIR'] as const) {
    const value = baseEnv[key]
    if (value !== undefined) env[key] = value
  }
  return env
}

async function writeTypeScriptCompiler(workspaceRoot: string, entryPath: string): Promise<string> {
  const compilerPath = path.join(workspaceRoot, '__codemind_ts_compile.mjs')
  const outputPath = path.join(workspaceRoot, 'main.mjs')
  await writeFile(
    compilerPath,
    [
      "import { readFileSync, writeFileSync } from 'node:fs'",
      "import ts from 'typescript'",
      `const source = readFileSync(${JSON.stringify(entryPath)}, 'utf8')`,
      'const result = ts.transpileModule(source, {',
      '  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, strict: true },',
      '  reportDiagnostics: true,',
      '})',
      'const diagnostics = result.diagnostics ?? []',
      'const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)',
      'if (errors.length > 0) {',
      '  console.error(ts.formatDiagnosticsWithColorAndContext(errors, {',
      "    getCanonicalFileName: (fileName) => fileName,",
      "    getCurrentDirectory: () => process.cwd(),",
      "    getNewLine: () => '\\n',",
      '  }))',
      '  process.exit(1)',
      '}',
      `writeFileSync(${JSON.stringify(outputPath)}, result.outputText, 'utf8')`,
      '',
    ].join('\n'),
    'utf8',
  )
  return compilerPath
}

async function plannedCommands(
  request: SandboxExecutionRequest,
  workspace: MaterializedWorkspace,
): Promise<readonly PlannedCommand[]> {
  const entry = path.relative(workspace.root, workspace.entryPath)
  const args = request.args ?? []
  switch (request.languageId) {
    case 'javascript':
      return [{ phase: request.mode === 'test' ? 'test' : 'run', command: 'node', args: [entry, ...args] }]
    case 'typescript': {
      const compilerPath = await writeTypeScriptCompiler(workspace.root, workspace.entryPath)
      const commands: PlannedCommand[] = [
        { phase: 'compile', command: 'node', args: [path.relative(workspace.root, compilerPath)] },
      ]
      if (request.mode !== 'compile') commands.push({ phase: 'run', command: 'node', args: ['main.mjs', ...args] })
      return commands
    }
    case 'python':
      return [{ phase: request.mode === 'test' ? 'test' : 'run', command: 'python3', args: [entry, ...args] }]
    case 'go':
      return request.mode === 'test'
        ? [{ phase: 'test', command: 'go', args: ['test', './...'] }]
        : [{ phase: 'run', command: 'go', args: ['run', entry, ...args] }]
    case 'rust':
      return compileThenMaybeRun(request, 'rustc', [entry, '-o', 'main'], './main', args)
    case 'java':
      return request.mode === 'compile'
        ? [{ phase: 'compile', command: 'javac', args: [entry] }]
        : [
            { phase: 'compile', command: 'javac', args: [entry] },
            { phase: 'run', command: 'java', args: ['-cp', workspace.root, 'Main', ...args] },
          ]
    case 'c':
      return compileThenMaybeRun(request, 'gcc', [entry, '-o', 'main'], './main', args)
    case 'cpp':
      return compileThenMaybeRun(request, 'g++', [entry, '-o', 'main'], './main', args)
    case 'ruby':
      return [{ phase: request.mode === 'test' ? 'test' : 'run', command: 'ruby', args: [entry, ...args] }]
    case 'php':
      return [{ phase: request.mode === 'test' ? 'test' : 'run', command: 'php', args: [entry, ...args] }]
    default:
      throw new Error(`No guarded-host backend command for ${request.languageId}`)
  }
}

function compileThenMaybeRun(
  request: SandboxExecutionRequest,
  command: string,
  compileArgs: readonly string[],
  executable: string,
  runArgs: readonly string[],
): readonly PlannedCommand[] {
  if (request.mode === 'compile') return [{ phase: 'compile', command, args: compileArgs }]
  return [
    { phase: 'compile', command, args: compileArgs },
    { phase: 'run', command: executable, args: [...runArgs] },
  ]
}

function appendCapped(
  existing: string,
  chunk: Buffer,
  maxOutputBytes: number,
): { value: string; truncated: boolean } {
  if (byteLength(existing) >= maxOutputBytes) return { value: existing, truncated: true }
  const text = chunk.toString('utf8')
  const remaining = maxOutputBytes - byteLength(existing)
  if (byteLength(text) <= remaining) return { value: `${existing}${text}`, truncated: false }
  return {
    value: `${existing}${text.slice(0, Math.max(0, remaining))}\n[TRUNCATED]`,
    truncated: true,
  }
}

async function runPlannedCommand(
  command: PlannedCommand,
  workspaceRoot: string,
  limits: SandboxLimits,
  env: NodeJS.ProcessEnv,
  state: MutableExecutionState,
): Promise<ProcessOutcome> {
  if (state.cancelRequested) {
    return { phase: command.phase, stdout: '', stderr: '', cancelled: true, timedOut: false, truncated: false }
  }

  return await new Promise<ProcessOutcome>((resolve) => {
    let stdout = ''
    let stderr = ''
    let truncated = false
    let timedOut = false
    const child = spawn(command.command, command.args, {
      cwd: workspaceRoot,
      env: minimalEnvironment(env, workspaceRoot, command.env),
      shell: false,
      detached: process.platform !== 'win32',
      stdio: 'pipe',
    })
    state.child = child

    const timer = setTimeout(() => {
      timedOut = true
      state.cancelRequested = true
      killChild(child)
    }, limits.timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      const appended = appendCapped(stdout, chunk, limits.maxOutputBytes)
      stdout = appended.value
      truncated = truncated || appended.truncated
    })
    child.stderr.on('data', (chunk: Buffer) => {
      const appended = appendCapped(stderr, chunk, limits.maxOutputBytes)
      stderr = appended.value
      truncated = truncated || appended.truncated
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      delete state.child
      resolve({
        phase: command.phase,
        stdout,
        stderr: `${stderr}${stderr.length === 0 ? '' : '\n'}${error.message}`,
        cancelled: state.cancelRequested,
        timedOut,
        truncated,
      })
    })
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer)
      delete state.child
      resolve({
        phase: command.phase,
        ...(exitCode === null ? {} : { exitCode }),
        ...(signal === null ? {} : { signal }),
        stdout,
        stderr,
        cancelled: state.cancelRequested && !timedOut,
        timedOut,
        truncated,
      })
    })
  })
}

function killChild(child: ChildProcessWithoutNullStreams): void {
  if (child.pid === undefined) return
  try {
    if (process.platform === 'win32') child.kill('SIGTERM')
    else process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGKILL')
  }
}

function failureStatus(outcome: ProcessOutcome): SandboxExecutionStatus {
  if (outcome.cancelled) return 'cancelled'
  if (outcome.timedOut) return 'timeout'
  if (outcome.phase === 'compile') return 'compile-error'
  if (outcome.phase === 'test') return 'failed'
  return 'runtime-error'
}

function diagnosticsFor(outcome: ProcessOutcome): readonly SandboxDiagnostic[] {
  if (outcome.exitCode === 0 && !outcome.timedOut && !outcome.cancelled) return []
  const message = outcome.cancelled
    ? 'Sandbox execution was cancelled.'
    : outcome.timedOut
      ? 'Sandbox execution timed out.'
      : `${outcome.phase} exited with code ${outcome.exitCode ?? 'unknown'}.`
  return [{ severity: outcome.cancelled || outcome.timedOut ? 'warning' : 'error', message }]
}

function buildResult(
  options: GuardedHostExecutionOptions,
  status: SandboxExecutionStatus,
  stdout: string,
  stderr: string,
  cleanup: SandboxExecutionResult['cleanup'],
  extra: {
    readonly exitCode?: number
    readonly signal?: string
    readonly diagnostics?: readonly SandboxDiagnostic[]
    readonly verificationLevel?: VerificationLevel
    readonly outputTruncated?: boolean
  } = {},
): SandboxExecutionResult {
  const completedAt = options.now().toISOString()
  return {
    executionId: options.executionId,
    languageId: options.request.languageId,
    runnerId: options.runner.id,
    trustClass: options.runner.trustClass,
    backend: options.runner.backend,
    status,
    startedAt: options.startedAt,
    completedAt,
    durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(options.startedAt)),
    ...(extra.exitCode === undefined ? {} : { exitCode: extra.exitCode }),
    ...(extra.signal === undefined ? {} : { signal: extra.signal }),
    stdout,
    stderr,
    outputTruncated: extra.outputTruncated ?? false,
    diagnostics: extra.diagnostics ?? [],
    artifacts: [],
    evidence: {
      verificationLevel: extra.verificationLevel ?? 'UNVERIFIED',
      inputHash: '',
      policyDecision: 'allowed',
      policyReason: 'Approved guarded-host execution; not a strong sandbox.',
    },
    cleanup,
  }
}

export async function executeGuardedHostRequest(
  options: GuardedHostExecutionOptions,
): Promise<SandboxExecutionResult> {
  let resolveCompleted!: (result: SandboxExecutionResult) => void
  const completed = new Promise<SandboxExecutionResult>((resolve) => {
    resolveCompleted = resolve
  })
  const state: MutableExecutionState = { cancelRequested: false }
  options.onStart?.({
    executionId: options.executionId,
    completed,
    cancel: () => {
      state.cancelRequested = true
      if (state.child !== undefined) killChild(state.child)
    },
  })

  const workspace = await materializeWorkspace(options.request)
  let stdout = ''
  let stderr = ''
  let truncated = false

  try {
    for (const command of await plannedCommands(options.request, workspace)) {
      const outcome = await runPlannedCommand(
        command,
        workspace.root,
        options.runner.limits,
        options.env,
        state,
      )
      stdout = `${stdout}${outcome.stdout}`
      stderr = `${stderr}${outcome.stderr}`
      truncated = truncated || outcome.truncated
      if (outcome.exitCode !== 0 || outcome.timedOut || outcome.cancelled) {
        const result = buildResult(options, failureStatus(outcome), stdout, stderr, await workspace.cleanup(), {
          ...(outcome.exitCode === undefined ? {} : { exitCode: outcome.exitCode }),
          ...(outcome.signal === undefined ? {} : { signal: outcome.signal }),
          diagnostics: diagnosticsFor(outcome),
          outputTruncated: truncated,
        })
        resolveCompleted(result)
        return result
      }
    }

    const result = buildResult(options, 'passed', stdout, stderr, await workspace.cleanup(), {
      exitCode: 0,
      verificationLevel: VERIFICATION_BY_MODE.get(options.request.mode) ?? 'UNVERIFIED',
      outputTruncated: truncated,
    })
    resolveCompleted(result)
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const result = buildResult(
      options,
      'internal-error',
      stdout,
      `${stderr}${stderr.length === 0 ? '' : '\n'}${message}`,
      await workspace.cleanup(),
      { diagnostics: [{ severity: 'error', message }], outputTruncated: truncated },
    )
    resolveCompleted(result)
    return result
  }
}
