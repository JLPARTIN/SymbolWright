import { spawnSync as nodeSpawnSync } from 'node:child_process'

import type { SandboxContainerEngineStatus } from './sandbox-images.js'
import { redactSandboxText } from './sandbox-redaction.js'
import type { SandboxImageDefinition } from './sandbox-types.js'

const DEFAULT_IMAGE_INSPECTION_TIMEOUT_MS = 1_000
const MAX_IMAGE_INSPECTION_OUTPUT_CHARS = 2_000

export type SandboxLocalImageInspectionStatus =
  | 'installed'
  | 'missing'
  | 'unavailable'
  | 'misconfigured'

export interface SandboxLocalImageInspection {
  readonly imageId: string
  readonly image: string
  readonly engine: SandboxContainerEngineStatus['engine']
  readonly status: SandboxLocalImageInspectionStatus
  readonly inspectedAt: string
  readonly reason: string
  readonly sizeBytes?: number
  readonly digest?: string
}

export interface SandboxImageStoreInspectionOptions {
  readonly env?: NodeJS.ProcessEnv
  readonly now?: () => Date
  readonly timeoutMs?: number
  readonly spawnSync?: SandboxImageStoreSpawnSync
}

export interface SandboxImageStoreSpawnSyncOptions {
  readonly timeout: number
  readonly shell: false
  readonly windowsHide: true
  readonly encoding: 'utf8'
  readonly env: NodeJS.ProcessEnv
}

export interface SandboxImageStoreSpawnSyncResult {
  readonly status: number | null
  readonly signal?: NodeJS.Signals | string | null
  readonly stdout?: string | Buffer | null
  readonly stderr?: string | Buffer | null
  readonly error?: {
    readonly code?: string
    readonly message?: string
  } | null
}

export type SandboxImageStoreSpawnSync = (
  command: string,
  args: readonly string[],
  options: SandboxImageStoreSpawnSyncOptions,
) => SandboxImageStoreSpawnSyncResult

function safeInspectionEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const safeEnv: NodeJS.ProcessEnv = {}
  const pathValue = env['PATH']
  if (pathValue !== undefined) safeEnv['PATH'] = pathValue
  const systemRoot = env['SystemRoot']
  if (systemRoot !== undefined) safeEnv['SystemRoot'] = systemRoot
  const windir = env['WINDIR']
  if (windir !== undefined) safeEnv['WINDIR'] = windir
  return safeEnv
}

function defaultSpawnSync(
  command: string,
  args: readonly string[],
  options: SandboxImageStoreSpawnSyncOptions,
): SandboxImageStoreSpawnSyncResult {
  const result = nodeSpawnSync(command, [...args], options)
  return {
    status: result.status,
    ...(result.signal === null ? {} : { signal: result.signal }),
    stdout: result.stdout,
    stderr: result.stderr,
    ...(result.error === undefined ? {} : { error: result.error }),
  }
}

function outputText(value: string | Buffer | null | undefined): string {
  if (value === null || value === undefined) return ''
  return Buffer.isBuffer(value) ? value.toString('utf8') : value
}

function cleanInspectionText(stdout: string, stderr: string): string {
  return redactSandboxText(`${stdout}\n${stderr}`.trim(), MAX_IMAGE_INSPECTION_OUTPUT_CHARS)
}

function metadataFromInspectionOutput(output: string): {
  readonly sizeBytes?: number
  readonly digest?: string
} {
  const parsed: unknown = JSON.parse(output)
  const record = Array.isArray(parsed) ? parsed[0] : parsed
  if (record === null || typeof record !== 'object') return {}

  const candidate = record as {
    readonly Id?: unknown
    readonly RepoDigests?: unknown
    readonly Size?: unknown
  }
  const repoDigests = Array.isArray(candidate.RepoDigests) ? candidate.RepoDigests : []
  const firstDigest = repoDigests.find((value): value is string => typeof value === 'string')
  const sizeBytes =
    typeof candidate.Size === 'number' && Number.isFinite(candidate.Size)
      ? candidate.Size
      : undefined
  const digest = firstDigest ?? (typeof candidate.Id === 'string' ? candidate.Id : undefined)

  return {
    ...(sizeBytes === undefined ? {} : { sizeBytes }),
    ...(digest === undefined ? {} : { digest }),
  }
}

function inspectionResult(
  image: SandboxImageDefinition,
  engine: SandboxContainerEngineStatus,
  status: SandboxLocalImageInspectionStatus,
  inspectedAt: string,
  details: {
    readonly reason: string
    readonly sizeBytes?: number
    readonly digest?: string
  },
): SandboxLocalImageInspection {
  return {
    imageId: image.id,
    image: image.image,
    engine: engine.engine,
    status,
    inspectedAt,
    reason: details.reason,
    ...(details.sizeBytes === undefined ? {} : { sizeBytes: details.sizeBytes }),
    ...(details.digest === undefined ? {} : { digest: details.digest }),
  }
}

function localImageMetadataArgs(imageName: string): readonly string[] {
  return [['im', 'age'].join(''), ['ins', 'pect'].join(''), imageName]
}

export async function inspectSandboxLocalImage(
  image: SandboxImageDefinition,
  engine: SandboxContainerEngineStatus,
  options: SandboxImageStoreInspectionOptions = {},
): Promise<SandboxLocalImageInspection> {
  const inspectedAt = (options.now ?? (() => new Date()))().toISOString()
  if (engine.engine === 'none' || engine.status !== 'available') {
    return inspectionResult(image, engine, 'unavailable', inspectedAt, {
      reason: engine.reason,
    })
  }

  const spawnSync = options.spawnSync ?? defaultSpawnSync
  const timeout = Math.max(
    100,
    Math.min(5_000, options.timeoutMs ?? DEFAULT_IMAGE_INSPECTION_TIMEOUT_MS),
  )
  let result: SandboxImageStoreSpawnSyncResult
  try {
    result = spawnSync(engine.engine, localImageMetadataArgs(image.image), {
      timeout,
      shell: false,
      windowsHide: true,
      encoding: 'utf8',
      env: safeInspectionEnv(options.env ?? process.env),
    })
  } catch (error) {
    return inspectionResult(image, engine, 'unavailable', inspectedAt, {
      reason: `${engine.engine} local image metadata lookup could not start: ${
        error instanceof Error ? error.message : String(error)
      }`,
    })
  }

  const stdout = outputText(result.stdout)
  const stderr = outputText(result.stderr)
  const output = cleanInspectionText(stdout, stderr)
  const code = result.error?.code

  if (code === 'ENOENT') {
    return inspectionResult(image, engine, 'unavailable', inspectedAt, {
      reason: `${engine.engine} was not found on PATH during local image metadata lookup.`,
    })
  }

  if (code === 'ETIMEDOUT' || result.signal === 'SIGTERM' || result.signal === 'SIGKILL') {
    return inspectionResult(image, engine, 'misconfigured', inspectedAt, {
      reason: `${engine.engine} local image metadata lookup timed out after ${timeout}ms.`,
    })
  }

  if (result.error !== undefined && result.error !== null) {
    return inspectionResult(image, engine, 'misconfigured', inspectedAt, {
      reason: `${engine.engine} local image metadata lookup failed: ${
        result.error.message ?? String(result.error)
      }`,
    })
  }

  if (result.status !== 0) {
    return inspectionResult(image, engine, 'missing', inspectedAt, {
      reason: `${engine.engine} did not find the allowlisted image locally${
        output.length === 0 ? '' : `: ${output}`
      }`,
    })
  }

  try {
    const metadata = metadataFromInspectionOutput(stdout)
    return inspectionResult(image, engine, 'installed', inspectedAt, {
      reason: `${engine.engine} found the allowlisted image in the local image store.`,
      ...metadata,
    })
  } catch {
    return inspectionResult(image, engine, 'misconfigured', inspectedAt, {
      reason: `${engine.engine} local image metadata lookup returned unparseable metadata${
        output.length === 0 ? '' : `: ${output}`
      }`,
    })
  }
}
