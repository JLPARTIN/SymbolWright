import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

import type { DependencyAcquisitionSession } from './dependency-acquisition-service.js'

export const NPM_DEPENDENCY_LAYER_SCHEMA_VERSION = 1 as const

export interface StrongSandboxDependencyLayer {
  readonly schemaVersion: typeof NPM_DEPENDENCY_LAYER_SCHEMA_VERSION
  readonly layerId: string
  readonly ecosystem: 'npm'
  readonly rootPath: string
  readonly nodeModulesPath: string
  readonly manifestPath: string
  readonly sbomPath: string
  readonly policyId: string
  readonly policyVersion: number
  readonly policyFingerprint: string
  readonly packageJsonSha256: string
  readonly packageLockSha256: string
  readonly packageCount: number
  readonly fileCount: number
  readonly totalBytes: number
  readonly manifestSha256: string
}

export interface NpmDependencyLayerFile {
  readonly path: string
  readonly sizeBytes: number
  readonly sha256: string
  readonly executable: boolean
}

export interface NpmDependencyLayerManifest {
  readonly schemaVersion: typeof NPM_DEPENDENCY_LAYER_SCHEMA_VERSION
  readonly layerId: string
  readonly ecosystem: 'npm'
  readonly policyId: string
  readonly policyVersion: number
  readonly policyFingerprint: string
  readonly packageJsonSha256: string
  readonly packageLockSha256: string
  readonly packageCount: number
  readonly files: readonly NpmDependencyLayerFile[]
}

export class NpmDependencyLayerError extends Error {
  public readonly code: string

  public constructor(code: string, message: string) {
    super(message)
    this.name = 'NpmDependencyLayerError'
    this.code = code
  }
}

/**
 * Builds an immutable node_modules layer exclusively from verified cache artifacts. Extraction is
 * path-confined, link-free, quota-bounded, and never invokes npm or package lifecycle scripts.
 */
export async function materializeNpmDependencyLayer(input: {
  readonly layerId: string
  readonly acquisition: DependencyAcquisitionSession
  readonly stateRoot?: string
}): Promise<StrongSandboxDependencyLayer> {
  const { plan, policy } = input.acquisition
  if (
    input.acquisition.report.status !== 'completed' ||
    plan === undefined ||
    policy === undefined
  ) {
    throw new NpmDependencyLayerError(
      'DEPENDENCY_LAYER_ACQUISITION_INCOMPLETE',
      'Only a completed governed acquisition can be materialized.',
    )
  }
  if (input.acquisition.acquiredArtifacts.length !== plan.artifacts.length) {
    throw new NpmDependencyLayerError(
      'DEPENDENCY_LAYER_ARTIFACTS_INCOMPLETE',
      'The acquisition did not retain every planned cache artifact.',
    )
  }

  const stateRoot = path.resolve(
    input.stateRoot ?? path.join(os.tmpdir(), 'symbolwright-dependency-layers'),
  )
  const layersRoot = path.join(stateRoot, 'layers')
  await fs.mkdir(layersRoot, { recursive: true, mode: 0o700 })
  const safeId = safeLayerId(input.layerId)
  const finalRoot = path.join(layersRoot, safeId)
  const tempRoot = await fs.mkdtemp(path.join(layersRoot, `.${safeId}-tmp-`))
  const nodeModulesPath = path.join(tempRoot, 'node_modules')
  await fs.mkdir(nodeModulesPath, { recursive: true, mode: 0o700 })

  try {
    let totalExtractedBytes = 0
    let totalExtractedFiles = 0
    const destinations = new Set<string>()

    for (const acquired of input.acquisition.acquiredArtifacts) {
      const packageRoot = dependencyPackageRoot(tempRoot, acquired.artifact.packagePath)
      const archive = await fs.readFile(acquired.cacheEntry.artifactPath)
      const extracted = await extractInspectedTarball({
        archive,
        entries: acquired.inspection.entries,
        packageRoot,
        destinations,
        maxTotalBytes: policy.limits.maxTotalBytes - totalExtractedBytes,
        maxFiles: policy.limits.maxFiles - totalExtractedFiles,
      })
      totalExtractedBytes += extracted.totalBytes
      totalExtractedFiles += extracted.fileCount
      await validateExtractedPackage(packageRoot, acquired.artifact.name, acquired.artifact.version)
      const shims = await materializePackageBinShims({
        layerRoot: tempRoot,
        packagePath: acquired.artifact.packagePath,
        packageRoot,
        destinations,
      })
      totalExtractedBytes += shims.totalBytes
      totalExtractedFiles += shims.fileCount
      if (
        totalExtractedBytes > policy.limits.maxTotalBytes ||
        totalExtractedFiles > policy.limits.maxFiles
      ) {
        throw new NpmDependencyLayerError(
          'DEPENDENCY_LAYER_QUOTA_EXCEEDED',
          'Materialized dependency layer exceeds the effective file or byte quota.',
        )
      }
    }

    const files = await manifestLayerFiles(
      tempRoot,
      policy.limits.maxFiles,
      policy.limits.maxTotalBytes,
    )
    const manifestMaterial: NpmDependencyLayerManifest = {
      schemaVersion: NPM_DEPENDENCY_LAYER_SCHEMA_VERSION,
      layerId: input.layerId,
      ecosystem: 'npm',
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      policyFingerprint: policy.fingerprint,
      packageJsonSha256: plan.packageJsonSha256,
      packageLockSha256: plan.packageLockSha256,
      packageCount: plan.packageCount,
      files,
    }
    const manifestBytes = Buffer.from(`${JSON.stringify(manifestMaterial, null, 2)}\n`, 'utf8')
    const sbomBytes = Buffer.from(`${JSON.stringify(plan.sbom, null, 2)}\n`, 'utf8')
    const manifestPath = path.join(tempRoot, '.symbolwright-dependency-layer.json')
    const sbomPath = path.join(tempRoot, '.symbolwright-dependency-sbom.cdx.json')
    await fs.writeFile(manifestPath, manifestBytes, { flag: 'wx', mode: 0o600 })
    await fs.writeFile(sbomPath, sbomBytes, { flag: 'wx', mode: 0o600 })

    await fs.rm(finalRoot, { recursive: true, force: true })
    await fs.rename(tempRoot, finalRoot)
    const finalManifestPath = path.join(finalRoot, path.basename(manifestPath))
    const finalSbomPath = path.join(finalRoot, path.basename(sbomPath))
    const totalBytes = files.reduce((total, file) => total + file.sizeBytes, 0)
    return Object.freeze({
      schemaVersion: NPM_DEPENDENCY_LAYER_SCHEMA_VERSION,
      layerId: input.layerId,
      ecosystem: 'npm',
      rootPath: finalRoot,
      nodeModulesPath: path.join(finalRoot, 'node_modules'),
      manifestPath: finalManifestPath,
      sbomPath: finalSbomPath,
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      policyFingerprint: policy.fingerprint,
      packageJsonSha256: plan.packageJsonSha256,
      packageLockSha256: plan.packageLockSha256,
      packageCount: plan.packageCount,
      fileCount: files.length,
      totalBytes,
      manifestSha256: sha256(manifestBytes),
    })
  } catch (error) {
    await fs.rm(tempRoot, { recursive: true, force: true })
    throw error
  }
}

export async function verifyNpmDependencyLayer(
  layer: StrongSandboxDependencyLayer,
): Promise<NpmDependencyLayerManifest> {
  const root = await fs.realpath(layer.rootPath)
  const manifestPath = containedPath(root, path.basename(layer.manifestPath))
  const manifestBytes = await fs.readFile(manifestPath)
  if (sha256(manifestBytes) !== layer.manifestSha256) {
    throw new NpmDependencyLayerError(
      'DEPENDENCY_LAYER_MANIFEST_MISMATCH',
      'Dependency layer manifest hash does not match its server-owned reference.',
    )
  }
  const manifest = parseLayerManifest(manifestBytes.toString('utf8'))
  if (
    manifest.layerId !== layer.layerId ||
    manifest.policyId !== layer.policyId ||
    manifest.policyVersion !== layer.policyVersion ||
    manifest.policyFingerprint !== layer.policyFingerprint ||
    manifest.packageLockSha256 !== layer.packageLockSha256
  ) {
    throw new NpmDependencyLayerError(
      'DEPENDENCY_LAYER_MANIFEST_MISMATCH',
      'Dependency layer manifest does not match its authorized reference.',
    )
  }

  const actual = await manifestLayerFiles(root, manifest.files.length, layer.totalBytes)
  if (stableJson(actual) !== stableJson(manifest.files)) {
    throw new NpmDependencyLayerError(
      'DEPENDENCY_LAYER_CONTENT_DRIFT',
      'Dependency layer files changed after materialization.',
    )
  }
  return manifest
}

export async function cleanupNpmDependencyLayer(
  layer: StrongSandboxDependencyLayer,
): Promise<void> {
  await fs.rm(layer.rootPath, { recursive: true, force: true })
}

async function extractInspectedTarball(input: {
  readonly archive: Uint8Array
  readonly entries: readonly {
    readonly path: string
    readonly type: 'file' | 'directory'
    readonly size: number
  }[]
  readonly packageRoot: string
  readonly destinations: Set<string>
  readonly maxTotalBytes: number
  readonly maxFiles: number
}): Promise<{ readonly totalBytes: number; readonly fileCount: number }> {
  let tar: Buffer
  try {
    tar = gunzipSync(input.archive)
  } catch {
    throw new NpmDependencyLayerError(
      'DEPENDENCY_LAYER_ARCHIVE_INVALID',
      'Cached dependency archive could not be decompressed during materialization.',
    )
  }
  let offset = 0
  let index = 0
  let totalBytes = 0
  let fileCount = 0
  while (index < input.entries.length) {
    const header = tar.subarray(offset, offset + 512)
    if (header.byteLength !== 512 || isZeroBlock(header)) {
      throw new NpmDependencyLayerError(
        'DEPENDENCY_LAYER_ARCHIVE_DRIFT',
        'Cached dependency archive no longer matches its inspection record.',
      )
    }
    const inspected = input.entries[index]
    if (inspected === undefined) break
    const size = parseOctal(header.subarray(124, 136))
    if (size !== inspected.size) {
      throw new NpmDependencyLayerError(
        'DEPENDENCY_LAYER_ARCHIVE_DRIFT',
        'Cached dependency archive size differs from its inspection record.',
      )
    }
    const relative = stripNpmPackageRoot(inspected.path)
    if (relative.length > 0) {
      const destination = containedPath(input.packageRoot, relative)
      const key = path.resolve(destination)
      if (input.destinations.has(key)) {
        throw new NpmDependencyLayerError(
          'DEPENDENCY_LAYER_DUPLICATE_PATH',
          `Dependency layer path is produced more than once: ${relative}`,
        )
      }
      input.destinations.add(key)
      if (inspected.type === 'directory') {
        await fs.mkdir(destination, { recursive: true, mode: 0o700 })
      } else {
        fileCount += 1
        totalBytes += size
        if (fileCount > input.maxFiles || totalBytes > input.maxTotalBytes) {
          throw new NpmDependencyLayerError(
            'DEPENDENCY_LAYER_QUOTA_EXCEEDED',
            'Dependency layer extraction exceeded its remaining quota.',
          )
        }
        const dataStart = offset + 512
        const dataEnd = dataStart + size
        if (dataEnd > tar.byteLength) {
          throw new NpmDependencyLayerError(
            'DEPENDENCY_LAYER_ARCHIVE_DRIFT',
            'Cached dependency archive is truncated.',
          )
        }
        const mode = parseOctal(header.subarray(100, 108))
        await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 })
        await fs.writeFile(destination, tar.subarray(dataStart, dataEnd), {
          flag: 'wx',
          mode: (mode & 0o111) === 0 ? 0o600 : 0o700,
        })
      }
    }
    offset += 512 + Math.ceil(size / 512) * 512
    index += 1
  }
  if (index !== input.entries.length) {
    throw new NpmDependencyLayerError(
      'DEPENDENCY_LAYER_ARCHIVE_DRIFT',
      'Cached dependency archive entry count differs from its inspection record.',
    )
  }
  return { totalBytes, fileCount }
}

async function validateExtractedPackage(
  packageRoot: string,
  expectedName: string,
  expectedVersion: string,
): Promise<void> {
  const packageJsonPath = containedPath(packageRoot, 'package.json')
  let value: unknown
  try {
    value = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as unknown
  } catch {
    throw new NpmDependencyLayerError(
      'DEPENDENCY_LAYER_PACKAGE_JSON_INVALID',
      'Extracted dependency package.json is missing or invalid.',
    )
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new NpmDependencyLayerError(
      'DEPENDENCY_LAYER_PACKAGE_JSON_INVALID',
      'Extracted dependency package.json must be an object.',
    )
  }
  const record = value as Record<string, unknown>
  if (record['name'] !== expectedName || record['version'] !== expectedVersion) {
    throw new NpmDependencyLayerError(
      'DEPENDENCY_LAYER_PACKAGE_IDENTITY_MISMATCH',
      'Extracted package identity does not match package-lock.json.',
    )
  }
}

async function materializePackageBinShims(input: {
  readonly layerRoot: string
  readonly packagePath: string
  readonly packageRoot: string
  readonly destinations: Set<string>
}): Promise<{ readonly totalBytes: number; readonly fileCount: number }> {
  const packageJson = JSON.parse(
    await fs.readFile(containedPath(input.packageRoot, 'package.json'), 'utf8'),
  ) as Record<string, unknown>
  const bins = normalizeBinMap(packageJson['name'], packageJson['bin'])
  if (bins.length === 0) return { totalBytes: 0, fileCount: 0 }
  const packageParent = path.posix.dirname(input.packagePath)
  const binRoot = containedPath(input.layerRoot, path.posix.join(packageParent, '.bin'))
  await fs.mkdir(binRoot, { recursive: true, mode: 0o700 })
  let totalBytes = 0
  for (const [name, target] of bins) {
    const targetPath = containedPath(input.packageRoot, normalizeRelativePath(target))
    const targetStat = await fs.lstat(targetPath)
    if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
      throw new NpmDependencyLayerError(
        'DEPENDENCY_LAYER_BIN_TARGET_INVALID',
        `Package bin target is not a regular file: ${name}`,
      )
    }
    const destination = containedPath(binRoot, safeBinName(name))
    const key = path.resolve(destination)
    if (input.destinations.has(key)) {
      throw new NpmDependencyLayerError(
        'DEPENDENCY_LAYER_DUPLICATE_BIN',
        `Dependency layer bin name is produced more than once: ${name}`,
      )
    }
    input.destinations.add(key)
    const relativeTarget = path.relative(binRoot, targetPath).replaceAll('\\', '/')
    const shim = Buffer.from(
      `#!/usr/bin/env node\n` +
        `const { spawnSync } = require('node:child_process')\n` +
        `const path = require('node:path')\n` +
        `const target = path.resolve(__dirname, ${JSON.stringify(relativeTarget)})\n` +
        `const result = spawnSync(process.execPath, [target, ...process.argv.slice(2)], { stdio: 'inherit' })\n` +
        `if (result.error) { console.error(result.error.message); process.exit(1) }\n` +
        `process.exit(result.status === null ? 1 : result.status)\n`,
      'utf8',
    )
    await fs.writeFile(destination, shim, { flag: 'wx', mode: 0o700 })
    totalBytes += shim.byteLength
  }
  return { totalBytes, fileCount: bins.length }
}

function normalizeBinMap(
  packageName: unknown,
  bin: unknown,
): readonly (readonly [string, string])[] {
  if (bin === undefined) return []
  if (typeof bin === 'string') {
    if (typeof packageName !== 'string' || packageName.length === 0) {
      throw new NpmDependencyLayerError(
        'DEPENDENCY_LAYER_BIN_INVALID',
        'String package bin requires a package name.',
      )
    }
    return [[packageName.split('/').pop() ?? packageName, bin]]
  }
  if (typeof bin !== 'object' || bin === null || Array.isArray(bin)) {
    throw new NpmDependencyLayerError(
      'DEPENDENCY_LAYER_BIN_INVALID',
      'Package bin must be a string or object.',
    )
  }
  return Object.entries(bin as Record<string, unknown>)
    .map(([name, target]) => {
      if (typeof target !== 'string' || target.length === 0) {
        throw new NpmDependencyLayerError(
          'DEPENDENCY_LAYER_BIN_INVALID',
          `Package bin target must be a non-empty string: ${name}`,
        )
      }
      return [name, target] as const
    })
    .sort(([left], [right]) => left.localeCompare(right))
}

async function manifestLayerFiles(
  root: string,
  maxFiles: number,
  maxBytes: number,
): Promise<readonly NpmDependencyLayerFile[]> {
  const files: NpmDependencyLayerFile[] = []
  let totalBytes = 0
  async function visit(directory: string, prefix: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name.startsWith('.symbolwright-dependency-')) continue
      const relative = prefix.length === 0 ? entry.name : path.posix.join(prefix, entry.name)
      const absolute = containedPath(root, relative)
      const stat = await fs.lstat(absolute)
      if (stat.isSymbolicLink()) {
        throw new NpmDependencyLayerError(
          'DEPENDENCY_LAYER_SYMLINK_FORBIDDEN',
          `Dependency layer contains a symlink: ${relative}`,
        )
      }
      if (stat.isDirectory()) {
        await visit(absolute, relative)
        continue
      }
      if (!stat.isFile()) {
        throw new NpmDependencyLayerError(
          'DEPENDENCY_LAYER_SPECIAL_FILE_FORBIDDEN',
          `Dependency layer contains a special file: ${relative}`,
        )
      }
      totalBytes += stat.size
      if (files.length + 1 > maxFiles || totalBytes > maxBytes) {
        throw new NpmDependencyLayerError(
          'DEPENDENCY_LAYER_QUOTA_EXCEEDED',
          'Dependency layer manifest exceeds the effective quota.',
        )
      }
      const content = await fs.readFile(absolute)
      files.push({
        path: relative,
        sizeBytes: content.byteLength,
        sha256: sha256(content),
        executable: (stat.mode & 0o111) !== 0,
      })
    }
  }
  await visit(root, '')
  return Object.freeze(files.map((file) => Object.freeze(file)))
}

function dependencyPackageRoot(layerRoot: string, packagePath: string): string {
  const normalized = normalizeRelativePath(packagePath)
  if (!normalized.startsWith('node_modules/')) {
    throw new NpmDependencyLayerError(
      'DEPENDENCY_LAYER_PACKAGE_PATH_INVALID',
      `Lockfile package path is outside node_modules: ${packagePath}`,
    )
  }
  return containedPath(layerRoot, normalized)
}

function stripNpmPackageRoot(value: string): string {
  if (value === 'package') return ''
  if (!value.startsWith('package/')) {
    throw new NpmDependencyLayerError(
      'DEPENDENCY_LAYER_ARCHIVE_ROOT_INVALID',
      `npm archive entry is outside package/: ${value}`,
    )
  }
  return normalizeRelativePath(value.slice('package/'.length))
}

function safeBinName(value: string): string {
  const candidate = value.split('/').pop() ?? value
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(candidate) || candidate === '.' || candidate === '..') {
    throw new NpmDependencyLayerError(
      'DEPENDENCY_LAYER_BIN_INVALID',
      'Package bin name contains unsafe characters.',
    )
  }
  return candidate
}

function parseLayerManifest(value: string): NpmDependencyLayerManifest {
  const parsed = JSON.parse(value) as unknown
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('schemaVersion' in parsed) ||
    parsed.schemaVersion !== NPM_DEPENDENCY_LAYER_SCHEMA_VERSION ||
    !('files' in parsed) ||
    !Array.isArray(parsed.files)
  ) {
    throw new NpmDependencyLayerError(
      'DEPENDENCY_LAYER_MANIFEST_INVALID',
      'Dependency layer manifest has an invalid schema.',
    )
  }
  return parsed as unknown as NpmDependencyLayerManifest
}

function parseOctal(field: Buffer): number {
  const zero = field.indexOf(0)
  const value = (zero < 0 ? field : field.subarray(0, zero)).toString('ascii').trim()
  if (value.length === 0) return 0
  if (!/^[0-7]+$/.test(value)) {
    throw new NpmDependencyLayerError(
      'DEPENDENCY_LAYER_ARCHIVE_DRIFT',
      'Cached dependency archive contains an invalid tar number.',
    )
  }
  const parsed = Number.parseInt(value, 8)
  if (!Number.isSafeInteger(parsed)) {
    throw new NpmDependencyLayerError(
      'DEPENDENCY_LAYER_ARCHIVE_DRIFT',
      'Cached dependency archive tar number exceeds safe bounds.',
    )
  }
  return parsed
}

function isZeroBlock(block: Buffer): boolean {
  for (const byte of block) if (byte !== 0) return false
  return true
}

function normalizeRelativePath(value: string): string {
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'))
  if (
    normalized.length === 0 ||
    path.posix.isAbsolute(normalized) ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized.includes('\0')
  ) {
    throw new NpmDependencyLayerError(
      'DEPENDENCY_LAYER_PATH_ESCAPE',
      `Dependency layer path escaped its root: ${value}`,
    )
  }
  return normalized
}

function containedPath(root: string, relativePath: string): string {
  const candidate = path.resolve(root, normalizeRelativePath(relativePath))
  const relative = path.relative(path.resolve(root), candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new NpmDependencyLayerError(
      'DEPENDENCY_LAYER_PATH_ESCAPE',
      `Dependency layer path escaped its root: ${relativePath}`,
    )
  }
  return candidate
}

function safeLayerId(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128)
  if (safe.length === 0 || safe === '.' || safe === '..') {
    throw new NpmDependencyLayerError(
      'DEPENDENCY_LAYER_ID_INVALID',
      'Dependency layer id is invalid.',
    )
  }
  return safe
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
