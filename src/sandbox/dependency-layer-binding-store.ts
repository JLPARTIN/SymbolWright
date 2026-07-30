import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import {
  verifyNpmDependencyLayer,
  type StrongSandboxDependencyLayer,
} from './npm-dependency-layer.js'
import { ensureSecureStateDirectory } from './secure-state-directory.js'

export const DEPENDENCY_LAYER_BINDING_SCHEMA_VERSION = 1 as const

interface DependencyLayerBindingRecord {
  readonly schemaVersion: typeof DEPENDENCY_LAYER_BINDING_SCHEMA_VERSION
  readonly workspaceIdSha256: string
  readonly boundAt: string
  readonly layer: StrongSandboxDependencyLayer
}

/**
 * Durable, server-owned binding between an authorized workspace/mission and one verified immutable
 * dependency layer. Callers never submit a layer path; execution resolves it by workspace identity.
 */
export class DependencyLayerBindingStore {
  private readonly root: string

  public constructor(root: string) {
    this.root = path.resolve(root)
  }

  public async bind(workspaceId: string, layer: StrongSandboxDependencyLayer): Promise<string> {
    const normalizedWorkspaceId = requireNonEmpty(workspaceId, 'workspaceId')
    await verifyNpmDependencyLayer(layer)
    await ensureSecureStateDirectory(this.root)
    const finalPath = this.pathFor(normalizedWorkspaceId)
    const tempPath = `${finalPath}.tmp-${process.pid}-${Date.now().toString(36)}`
    const record: DependencyLayerBindingRecord = {
      schemaVersion: DEPENDENCY_LAYER_BINDING_SCHEMA_VERSION,
      workspaceIdSha256: sha256(normalizedWorkspaceId),
      boundAt: new Date().toISOString(),
      layer,
    }
    await fs.writeFile(tempPath, `${JSON.stringify(record, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    })
    await fs.rename(tempPath, finalPath)
    return finalPath
  }

  public async resolve(workspaceId: string): Promise<StrongSandboxDependencyLayer | undefined> {
    const normalizedWorkspaceId = requireNonEmpty(workspaceId, 'workspaceId')
    let text: string
    try {
      text = await fs.readFile(this.pathFor(normalizedWorkspaceId), 'utf8')
    } catch (error) {
      if (isNotFound(error)) return undefined
      throw error
    }
    const record = parseRecord(text)
    if (record.workspaceIdSha256 !== sha256(normalizedWorkspaceId)) {
      throw new Error('Dependency layer binding does not match the authorized workspace identity.')
    }
    await verifyNpmDependencyLayer(record.layer)
    return record.layer
  }

  private pathFor(workspaceId: string): string {
    return path.join(this.root, `${sha256(workspaceId)}.json`)
  }
}

function parseRecord(text: string): DependencyLayerBindingRecord {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Dependency layer binding is not valid JSON.')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Dependency layer binding must be an object.')
  }
  const record = parsed as Record<string, unknown>
  if (record['schemaVersion'] !== DEPENDENCY_LAYER_BINDING_SCHEMA_VERSION) {
    throw new Error('Dependency layer binding schema version is unsupported.')
  }
  if (typeof record['workspaceIdSha256'] !== 'string' || typeof record['boundAt'] !== 'string') {
    throw new Error('Dependency layer binding metadata is invalid.')
  }
  if (
    typeof record['layer'] !== 'object' ||
    record['layer'] === null ||
    Array.isArray(record['layer'])
  ) {
    throw new Error('Dependency layer binding has no valid layer reference.')
  }
  return record as unknown as DependencyLayerBindingRecord
}

function requireNonEmpty(value: string, name: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) throw new Error(`${name} must not be empty.`)
  return normalized
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ENOENT'
  )
}
