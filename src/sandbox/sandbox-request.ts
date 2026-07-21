import path from 'node:path'

import { normalizeSandboxLimits } from './sandbox-limits.js'
import type {
  SandboxExecutionMode,
  SandboxExecutionRequest,
  SandboxLimits,
} from './sandbox-types.js'

export class SandboxRequestValidationError extends Error {}

export interface SandboxRequestValidationOptions {
  readonly knownLanguageIds: readonly string[]
  readonly knownRunnerIds: readonly string[]
}

type MutableSandboxLimitOverrides = {
  -readonly [Key in keyof SandboxLimits]?: SandboxLimits[Key]
}

const EXECUTION_MODES: readonly SandboxExecutionMode[] = ['run', 'compile', 'test']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new SandboxRequestValidationError(`${key} must be a string`)
  if (value.includes('\0')) throw new SandboxRequestValidationError(`${key} must not contain null bytes`)
  return value
}

function readStringArray(record: Record<string, unknown>, key: string): readonly string[] | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new SandboxRequestValidationError(`${key} must be an array`)
  return value.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw new SandboxRequestValidationError(`${key}[${index}] must be a string`)
    }
    if (entry.includes('\0')) throw new SandboxRequestValidationError(`${key}[${index}] null byte rejected`)
    return entry
  })
}

function assertSafeRelativePath(filePath: string): void {
  if (filePath.includes('\0')) throw new SandboxRequestValidationError('Path null byte rejected')
  if (filePath.length === 0) throw new SandboxRequestValidationError('Path must not be empty')
  if (path.isAbsolute(filePath) || /^[A-Za-z]:[\\/]/.test(filePath)) {
    throw new SandboxRequestValidationError('Absolute paths are not allowed')
  }
  const normalized = path.posix.normalize(filePath.replace(/\\/g, '/'))
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new SandboxRequestValidationError('Path traversal is not allowed')
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function parseLimits(value: unknown): Partial<SandboxLimits> | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) throw new SandboxRequestValidationError('limits must be an object')

  const parsed: MutableSandboxLimitOverrides = {}
  for (const key of [
    'timeoutMs',
    'compileTimeoutMs',
    'maxMemoryMb',
    'maxCpuPercent',
    'maxProcesses',
    'maxOutputBytes',
    'maxArtifactBytes',
    'maxFiles',
    'maxFileBytes',
    'maxTotalSourceBytes',
    'maxStdinBytes',
    'maxArgs',
    'maxArgBytes',
  ] as const) {
    const raw = value[key]
    if (raw === undefined) continue
    if (typeof raw !== 'number') throw new SandboxRequestValidationError(`limits.${key} must be numeric`)
    parsed[key] = raw
  }
  return parsed
}

export function validateSandboxExecutionRequest(
  raw: unknown,
  options: SandboxRequestValidationOptions,
): SandboxExecutionRequest {
  if (!isRecord(raw)) throw new SandboxRequestValidationError('Sandbox request must be an object')

  const languageId = readString(raw, 'languageId')
  if (languageId === undefined || !options.knownLanguageIds.includes(languageId)) {
    throw new SandboxRequestValidationError(`Unknown languageId: ${languageId ?? 'missing'}`)
  }

  const mode = readString(raw, 'mode')
  if (mode === undefined || !EXECUTION_MODES.includes(mode as SandboxExecutionMode)) {
    throw new SandboxRequestValidationError(`Unsupported sandbox mode: ${mode ?? 'missing'}`)
  }

  const requestedRunnerId = readString(raw, 'requestedRunnerId')
  if (requestedRunnerId !== undefined && !options.knownRunnerIds.includes(requestedRunnerId)) {
    throw new SandboxRequestValidationError(`Unknown requestedRunnerId: ${requestedRunnerId}`)
  }

  const source = readString(raw, 'source')
  const stdin = readString(raw, 'stdin')
  const args = readStringArray(raw, 'args')
  const missionId = readString(raw, 'missionId')
  const limits = normalizeSandboxLimits(parseLimits(raw['limits']))

  if (source !== undefined && byteLength(source) > limits.maxTotalSourceBytes) {
    throw new SandboxRequestValidationError('source exceeds maxTotalSourceBytes')
  }
  if (stdin !== undefined && byteLength(stdin) > limits.maxStdinBytes) {
    throw new SandboxRequestValidationError('stdin exceeds maxStdinBytes')
  }
  if (args !== undefined) {
    if (args.length > limits.maxArgs) throw new SandboxRequestValidationError('too many arguments')
    for (const arg of args) {
      if (byteLength(arg) > limits.maxArgBytes) {
        throw new SandboxRequestValidationError('argument exceeds maxArgBytes')
      }
    }
  }

  const rawFiles = raw['files']
  const files = rawFiles === undefined ? undefined : parseFiles(rawFiles, limits)
  const rawRepository = raw['repository']
  const repository = rawRepository === undefined ? undefined : parseRepositoryTarget(rawRepository)

  const sourceModeCount = [source !== undefined, files !== undefined, repository !== undefined].filter(
    Boolean,
  ).length
  if (sourceModeCount !== 1) {
    throw new SandboxRequestValidationError('Exactly one source mode is required')
  }

  return {
    languageId,
    mode: mode as SandboxExecutionMode,
    ...(source === undefined ? {} : { source }),
    ...(files === undefined ? {} : { files }),
    ...(repository === undefined ? {} : { repository }),
    ...(stdin === undefined ? {} : { stdin }),
    ...(args === undefined ? {} : { args }),
    limits,
    ...(missionId === undefined ? {} : { missionId }),
    ...(requestedRunnerId === undefined ? {} : { requestedRunnerId }),
  }
}

function parseFiles(value: unknown, limits: SandboxLimits): SandboxExecutionRequest['files'] {
  if (!Array.isArray(value)) throw new SandboxRequestValidationError('files must be an array')
  if (value.length === 0) throw new SandboxRequestValidationError('files must not be empty')
  if (value.length > limits.maxFiles) throw new SandboxRequestValidationError('too many source files')

  const seen = new Set<string>()
  let totalBytes = 0
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new SandboxRequestValidationError(`files[${index}] must be an object`)
    const filePath = readString(entry, 'path')
    const content = readString(entry, 'content')
    if (filePath === undefined || content === undefined) {
      throw new SandboxRequestValidationError(`files[${index}] requires path and content`)
    }
    assertSafeRelativePath(filePath)
    const normalized = path.posix.normalize(filePath.replace(/\\/g, '/'))
    if (seen.has(normalized)) throw new SandboxRequestValidationError(`duplicate file path: ${normalized}`)
    seen.add(normalized)
    const fileBytes = byteLength(content)
    if (fileBytes > limits.maxFileBytes) throw new SandboxRequestValidationError('file exceeds maxFileBytes')
    totalBytes += fileBytes
    if (totalBytes > limits.maxTotalSourceBytes) {
      throw new SandboxRequestValidationError('files exceed maxTotalSourceBytes')
    }
    return { path: normalized, content }
  })
}

function parseRepositoryTarget(value: unknown): SandboxExecutionRequest['repository'] {
  if (!isRecord(value)) throw new SandboxRequestValidationError('repository must be an object')
  const rootPath = readString(value, 'rootPath')
  if (rootPath === undefined || rootPath.length === 0) {
    throw new SandboxRequestValidationError('repository.rootPath is required')
  }
  const selectedPaths = readStringArray(value, 'selectedPaths')
  if (selectedPaths !== undefined) {
    for (const selectedPath of selectedPaths) assertSafeRelativePath(selectedPath)
  }
  return {
    rootPath,
    ...(selectedPaths === undefined ? {} : { selectedPaths }),
  }
}
