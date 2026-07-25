import { stat, readFile } from 'node:fs/promises'
import path from 'node:path'

import { renderNotYetActive } from './cli-commands.js'
import {
  renderSandboxDoctorCommand,
  renderSandboxImagesCommand,
  type SandboxDoctorOptions,
} from './sandbox/sandbox-doctor.js'
import { SandboxHistoryStore } from './sandbox/sandbox-history.js'
import { renderSandboxImageInspectCommand } from './sandbox/sandbox-image-commands.js'
import { SandboxService } from './sandbox/sandbox-service.js'
import type { SandboxExecutionResult } from './sandbox/sandbox-types.js'

export interface SandboxCliOptions extends SandboxDoctorOptions {
  readonly workspaceRoot?: string
}

const LANGUAGE_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ['.js', 'javascript'],
  ['.mjs', 'javascript'],
  ['.cjs', 'javascript'],
  ['.ts', 'typescript'],
  ['.tsx', 'typescript'],
  ['.py', 'python'],
  ['.go', 'go'],
  ['.rs', 'rust'],
  ['.java', 'java'],
  ['.c', 'c'],
  ['.cpp', 'cpp'],
  ['.cc', 'cpp'],
  ['.cxx', 'cpp'],
  ['.rb', 'ruby'],
  ['.php', 'php'],
])

export async function renderSandboxCommand(
  args: readonly string[],
  options: SandboxCliOptions = {},
): Promise<string> {
  const [subcommand, ...subcommandArgs] = args

  if (subcommand === undefined || subcommand === 'doctor') {
    return renderSandboxDoctorCommand(options)
  }

  if (subcommand === 'images') {
    return renderSandboxImagesCommand(options)
  }

  if (subcommand === 'inspect') {
    return renderSandboxImageInspectCommand(subcommandArgs, options)
  }

  if (subcommand === 'list') {
    return renderSandboxDoctorCommand(options)
  }

  if (subcommand === 'run') {
    return renderSandboxRunCommand(subcommandArgs, options)
  }

  if (subcommand === 'test') {
    return renderSandboxTestCommand(subcommandArgs, options)
  }

  if (subcommand === 'history') {
    return renderSandboxHistoryCommand(options)
  }

  if (subcommand === 'cleanup') {
    return renderSandboxCleanupCommand(options)
  }

  return renderNotYetActive(args.length > 0 ? `sandbox ${args.join(' ')}` : 'sandbox')
}

async function renderSandboxRunCommand(
  args: readonly string[],
  options: SandboxCliOptions,
): Promise<string> {
  const filePath = args[0]
  if (filePath === undefined) return 'Usage: symbolwright sandbox run <file>'
  return executeFile(filePath, 'run', options)
}

async function renderSandboxTestCommand(
  args: readonly string[],
  options: SandboxCliOptions,
): Promise<string> {
  const filePath = args[0]
  if (filePath === undefined) return 'Usage: symbolwright sandbox test <file>'
  return executeFile(filePath, 'test', options)
}

async function executeFile(
  filePath: string,
  mode: 'run' | 'test',
  options: SandboxCliOptions,
): Promise<string> {
  const workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd())
  const absolutePath = path.resolve(workspaceRoot, filePath)
  if (!inside(absolutePath, workspaceRoot)) {
    return 'Sandbox error: file must stay inside workspace root.'
  }

  let fileStat: Awaited<ReturnType<typeof stat>>
  try {
    fileStat = await stat(absolutePath)
  } catch (error) {
    if (isMissingFileError(error)) return `Sandbox error: file not found: ${filePath}.`
    const message = error instanceof Error ? error.message : String(error)
    return `Sandbox error: cannot access file ${filePath}: ${message}`
  }

  if (!fileStat.isFile()) return 'Sandbox error: target must be a file.'
  const languageId = languageForPath(absolutePath)
  if (languageId === undefined) return `Sandbox error: unsupported file extension for ${filePath}.`

  const historyStore = new SandboxHistoryStore({ workspaceRoot })
  const service = new SandboxService({
    historyStore,
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.discoverCommandAvailability === undefined
      ? {}
      : { discoverCommandAvailability: options.discoverCommandAvailability }),
  })
  await service.refreshInventory()
  const content = await readFile(absolutePath, 'utf8')
  const result = await service.execute(
    {
      languageId,
      mode,
      source: content,
      requestedRunnerId: `guarded-host-${languageId}`,
    },
    { mode: 'APPROVED_EXECUTION' },
  )
  return renderSandboxExecutionResult(result)
}

function renderSandboxHistoryCommand(options: SandboxCliOptions): string {
  const workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd())
  const history = new SandboxHistoryStore({ workspaceRoot }).list(50)
  return [
    'SymbolWright Sandbox History',
    '',
    ...history.executions.map(
      (execution) =>
        `- ${execution.executionId}: ${execution.languageId}/${execution.runnerId} ${execution.status} ${execution.durationMs}ms`,
    ),
    ...(history.executions.length === 0 ? ['- no sandbox executions recorded'] : []),
    ...history.warnings.map((warning) => `Warning: ${warning}`),
  ].join('\n')
}

function renderSandboxCleanupCommand(options: SandboxCliOptions): string {
  const workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd())
  new SandboxHistoryStore({ workspaceRoot }).cleanup()
  return 'SymbolWright Sandbox Cleanup\n\nRemoved local .symbolwright/sandbox execution history and artifacts.'
}

function renderSandboxExecutionResult(result: SandboxExecutionResult): string {
  return [
    'SymbolWright Sandbox Execution',
    '',
    `Execution ID: ${result.executionId}`,
    `Status: ${result.status}`,
    `Verification: ${result.evidence.verificationLevel}`,
    `Language: ${result.languageId}`,
    `Runner: ${result.runnerId}`,
    `Backend: ${result.backend}`,
    `Trust class: ${result.trustClass}`,
    `Duration: ${result.durationMs}ms`,
    ...(result.exitCode === undefined ? [] : [`Exit code: ${result.exitCode}`]),
    `Cleanup: ${result.cleanup.attempted}/${result.cleanup.succeeded}`,
    `Output truncated: ${result.outputTruncated}`,
    '',
    'STDOUT:',
    result.stdout.length === 0 ? '(empty)' : result.stdout,
    '',
    'STDERR:',
    result.stderr.length === 0 ? '(empty)' : result.stderr,
    '',
    'Diagnostics:',
    ...(result.diagnostics.length === 0
      ? ['- none']
      : result.diagnostics.map((diagnostic) => `- ${diagnostic.severity}: ${diagnostic.message}`)),
  ].join('\n')
}

function languageForPath(filePath: string): string | undefined {
  return LANGUAGE_BY_EXTENSION.get(path.extname(filePath))
}

function inside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child)
  return relative.length === 0 || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ENOENT'
  )
}
