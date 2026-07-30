import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { DependencyAcquisitionSession } from './dependency-acquisition-service.js'
import type { DependencyAcquisitionLimits } from './dependency-policy.js'
import type { StrongSandboxDependencyLayer } from './npm-dependency-layer.js'
import type { ApplicationSandboxNetworkRuntime } from './sandbox-network-runtime.js'
import type { SandboxAuthorizationContext } from './sandbox-policy-model.js'

const MAX_MANIFEST_BYTES = 8 * 1024 * 1024
const ALLOWED_INPUT_FIELDS = new Set(['registryUrls', 'limits'])
const FORBIDDEN_INPUT_FIELDS = new Set([
  'packageJsonText',
  'packageLockText',
  'packageJsonPath',
  'packageLockPath',
  'cwd',
  'workspaceRoot',
  'stateRoot',
  'policy',
  'policyId',
  'policyReference',
  'approval',
  'authorization',
  'grantId',
  'principalId',
])

export interface GovernedDependencyAcquisitionRequest {
  readonly registryUrls?: readonly string[]
  readonly limits?: Partial<DependencyAcquisitionLimits>
}

export interface GovernedDependencyAcquisitionResult {
  readonly session: DependencyAcquisitionSession
  readonly layer?: StrongSandboxDependencyLayer
  readonly bindingPath?: string
}

export function parseGovernedDependencyAcquisitionRequest(
  input: unknown,
): GovernedDependencyAcquisitionRequest {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('dependency_acquire input must be a JSON object.')
  }
  const record = input as Record<string, unknown>
  for (const field of Object.keys(record)) {
    if (FORBIDDEN_INPUT_FIELDS.has(field)) {
      throw new Error(`dependency_acquire rejects caller-controlled authority field: ${field}`)
    }
    if (!ALLOWED_INPUT_FIELDS.has(field)) {
      throw new Error(`dependency_acquire rejects unknown request field: ${field}`)
    }
  }
  const registryUrls = optionalStringArray(record['registryUrls'], 'registryUrls')
  const limits = optionalLimits(record['limits'])
  return {
    ...(registryUrls === undefined ? {} : { registryUrls }),
    ...(limits === undefined ? {} : { limits }),
  }
}

export async function acquireGovernedNpmDependencies(input: {
  readonly workspaceRoot: string
  readonly runtime: ApplicationSandboxNetworkRuntime
  readonly authorization: SandboxAuthorizationContext
  readonly request?: GovernedDependencyAcquisitionRequest
  readonly signal?: AbortSignal
}): Promise<GovernedDependencyAcquisitionResult> {
  const workspaceRoot = path.resolve(input.workspaceRoot)
  const [packageJsonText, packageLockText] = await Promise.all([
    readManifest(workspaceRoot, 'package.json'),
    readManifest(workspaceRoot, 'package-lock.json'),
  ])
  const session = await input.runtime.gateway.acquireNpm({
    packageJsonText,
    packageLockText,
    authorization: input.authorization,
    ...(input.request === undefined ? {} : { request: input.request }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  })
  if (session.report.status !== 'completed' || session.plan === undefined) return { session }

  const layer = await input.runtime.gateway.materializeNpmLayer(
    layerIdFor(input.authorization.workspaceId, session.report.packageLockSha256),
    session,
  )
  const bindingPath = await input.runtime.dependencyLayers.bind(
    input.authorization.workspaceId,
    layer,
  )
  return { session, layer, bindingPath }
}

export function renderGovernedDependencyAcquisitionResult(
  result: GovernedDependencyAcquisitionResult,
): string {
  const { report } = result.session
  return JSON.stringify(
    {
      acquisitionId: report.acquisitionId,
      status: report.status,
      decisionCode: report.decisionCode,
      reason: report.reason,
      packageCount: report.packageCount,
      cacheHits: report.cacheHits,
      networkRequests: report.networkRequests,
      archiveBytes: report.archiveBytes,
      expandedBytes: report.expandedBytes,
      fileCount: report.fileCount,
      evidenceSha256: report.evidenceSha256,
      ...(report.policy === undefined ? {} : { policy: report.policy }),
      ...(result.layer === undefined
        ? {}
        : {
            dependencyLayer: {
              layerId: result.layer.layerId,
              packageCount: result.layer.packageCount,
              fileCount: result.layer.fileCount,
              totalBytes: result.layer.totalBytes,
              manifestSha256: result.layer.manifestSha256,
              packageLockSha256: result.layer.packageLockSha256,
            },
          }),
    },
    null,
    2,
  )
}

async function readManifest(workspaceRoot: string, fileName: string): Promise<string> {
  const filePath = path.join(workspaceRoot, fileName)
  const stat = await fs.lstat(filePath)
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${fileName} must be a regular file in the authorized workspace.`)
  }
  if (stat.size > MAX_MANIFEST_BYTES) {
    throw new Error(`${fileName} exceeds the ${MAX_MANIFEST_BYTES}-byte limit.`)
  }
  return fs.readFile(filePath, 'utf8')
}

function optionalStringArray(value: unknown, name: string): readonly string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new Error(`${name} must be an array of strings.`)
  }
  return Object.freeze([...value]) as readonly string[]
}

function optionalLimits(value: unknown): Partial<DependencyAcquisitionLimits> | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('limits must be a JSON object.')
  }
  const allowed = new Set<keyof DependencyAcquisitionLimits>([
    'maxPackages',
    'maxRequests',
    'maxArchiveBytes',
    'maxExpandedBytes',
    'maxFiles',
    'maxFileBytes',
    'maxTotalBytes',
    'timeoutMs',
    'maxConcurrency',
  ])
  const result: Partial<Record<keyof DependencyAcquisitionLimits, number>> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!allowed.has(key as keyof DependencyAcquisitionLimits)) {
      throw new Error(`Unknown dependency limit: ${key}`)
    }
    if (typeof entry !== 'number' || !Number.isFinite(entry) || entry <= 0) {
      throw new Error(`Dependency limit ${key} must be a positive number.`)
    }
    result[key as keyof DependencyAcquisitionLimits] = Math.floor(entry)
  }
  return result
}

function layerIdFor(workspaceId: string, packageLockSha256: string | undefined): string {
  return `npm-${createHash('sha256')
    .update(`${workspaceId}\u0000${packageLockSha256 ?? 'unknown'}`, 'utf8')
    .digest('hex')
    .slice(0, 32)}`
}
