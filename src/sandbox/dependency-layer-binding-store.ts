import { createHash, randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { sealDependencyLayerForMount } from './dependency-layer-mount-permissions.js'
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

export type DependencyLayerBindingStatus = 'valid' | 'missing-layer' | 'invalid-record'

export interface DependencyLayerBindingSummary {
  readonly layerId: string
  readonly boundAt: string
  readonly status: DependencyLayerBindingStatus
  readonly detail?: string
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
    await sealDependencyLayerForMount(layer)
    await verifyNpmDependencyLayer(layer)
    await ensureSecureStateDirectory(this.root)
    const finalPath = this.pathFor(normalizedWorkspaceId)
    const tempPath = `${finalPath}.tmp-${process.pid}-${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`
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
    await sealDependencyLayerForMount(record.layer)
    return record.layer
  }

  /**
   * Read-only enumeration for boot-time reconciliation and operator visibility. Never mutates,
   * never seals a layer for mount, and never throws for an individual broken binding -- each entry
   * is independently classified so one corrupt or dangling record can't hide the rest. A binding
   * file that is itself a symlink (lstat-checked, never followed) is silently excluded rather than
   * reported, since it was never a binding this store wrote.
   */
  public async listBindings(): Promise<readonly DependencyLayerBindingSummary[]> {
    let entries: string[]
    try {
      entries = await fs.readdir(this.root)
    } catch (error) {
      if (isNotFound(error)) return []
      throw error
    }

    const summaries: DependencyLayerBindingSummary[] = []
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      const fullPath = path.join(this.root, entry)
      const stat = await fs.lstat(fullPath).catch(() => undefined)
      if (stat === undefined || !stat.isFile()) continue

      let record: DependencyLayerBindingRecord
      try {
        record = parseRecord(await fs.readFile(fullPath, 'utf8'))
      } catch (error) {
        summaries.push({
          layerId: 'unknown',
          boundAt: 'unknown',
          status: 'invalid-record',
          detail: errorMessage(error),
        })
        continue
      }

      try {
        await verifyNpmDependencyLayer(record.layer)
        summaries.push({
          layerId: record.layer.layerId,
          boundAt: record.boundAt,
          status: 'valid',
        })
      } catch (error) {
        summaries.push({
          layerId: record.layer.layerId,
          boundAt: record.boundAt,
          status: 'missing-layer',
          detail: errorMessage(error),
        })
      }
    }
    return summaries
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
