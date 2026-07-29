import { createHash, timingSafeEqual } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { EffectiveDependencyPolicy } from './dependency-policy.js'
import type { NpmDependencyArtifact } from './npm-dependency-plan.js'

export const DEPENDENCY_CACHE_METADATA_SCHEMA_VERSION = 1 as const

export interface DependencyCacheProvenance {
  readonly schemaVersion: typeof DEPENDENCY_CACHE_METADATA_SCHEMA_VERSION
  readonly cacheKey: string
  readonly namespace: string
  readonly algorithm: NpmDependencyArtifact['integrityAlgorithm']
  readonly digestHex: string
  readonly byteLength: number
  readonly packageName: string
  readonly packageVersion: string
  readonly sourceUrlSha256: string
  readonly policyId: string
  readonly policyVersion: number
  readonly policyFingerprint: string
  readonly acquiredAt: string
}

export interface DependencyCacheEntry {
  readonly artifactPath: string
  readonly metadataPath: string
  readonly provenance: DependencyCacheProvenance
  readonly cacheHit: boolean
}

export class DependencyArtifactCacheError extends Error {
  public readonly code: string

  public constructor(code: string, message: string) {
    super(message)
    this.name = 'DependencyArtifactCacheError'
    this.code = code
  }
}

export interface DependencyArtifactCacheOptions {
  readonly root: string
  readonly now?: () => Date
}

/**
 * Integrity-addressed dependency artifact storage. Cache identity comes exclusively from the
 * lockfile integrity digest; source URLs and package names are provenance, never path authority.
 */
export class DependencyArtifactCache {
  private readonly root: string
  private readonly now: () => Date
  private readonly locks = new Map<string, Promise<void>>()

  public constructor(options: DependencyArtifactCacheOptions) {
    this.root = path.resolve(options.root)
    this.now = options.now ?? (() => new Date())
  }

  public async putNpmArtifact(input: {
    readonly artifact: NpmDependencyArtifact
    readonly bytes: Uint8Array
    readonly policy: EffectiveDependencyPolicy
  }): Promise<DependencyCacheEntry> {
    assertArtifactIdentity(input.artifact)
    if (input.bytes.byteLength > input.policy.limits.maxArchiveBytes) {
      throw new DependencyArtifactCacheError(
        'DEPENDENCY_ARCHIVE_QUOTA_EXCEEDED',
        `Dependency archive is ${input.bytes.byteLength} bytes; policy allows ${input.policy.limits.maxArchiveBytes}.`,
      )
    }
    verifyDigest(input.artifact, input.bytes)

    const paths = this.pathsFor(input.policy.cacheNamespace, input.artifact)
    return this.withKeyLock(paths.lockKey, async () => {
      await ensureSafeDirectory(this.root, 0o700)
      await ensureSafeDirectory(paths.namespaceRoot, 0o700)
      await ensureSafeDirectory(paths.algorithmRoot, 0o700)
      await ensureSafeDirectory(paths.prefixRoot, 0o700)

      const existing = await this.readVerifiedEntry({
        paths,
        artifact: input.artifact,
        policy: input.policy,
      })
      if (existing !== undefined) return existing

      const provenance: DependencyCacheProvenance = Object.freeze({
        schemaVersion: DEPENDENCY_CACHE_METADATA_SCHEMA_VERSION,
        cacheKey: input.artifact.cacheKey,
        namespace: input.policy.cacheNamespace,
        algorithm: input.artifact.integrityAlgorithm,
        digestHex: input.artifact.integrityDigestHex,
        byteLength: input.bytes.byteLength,
        packageName: input.artifact.name,
        packageVersion: input.artifact.version,
        sourceUrlSha256: sha256(input.artifact.resolvedUrl),
        policyId: input.policy.policyId,
        policyVersion: input.policy.policyVersion,
        policyFingerprint: input.policy.fingerprint,
        acquiredAt: this.now().toISOString(),
      })
      const nonce = `${process.pid}-${Date.now().toString(36)}-${randomSuffix()}`
      const artifactTemp = `${paths.artifactPath}.tmp-${nonce}`
      const metadataTemp = `${paths.metadataPath}.tmp-${nonce}`
      try {
        await writeExclusive(artifactTemp, input.bytes, 0o600)
        await writeExclusive(
          metadataTemp,
          Buffer.from(`${JSON.stringify(provenance)}\n`, 'utf8'),
          0o600,
        )
        await fs.rename(artifactTemp, paths.artifactPath)
        await fs.rename(metadataTemp, paths.metadataPath)
      } catch (error) {
        await Promise.allSettled([
          fs.rm(artifactTemp, { force: true }),
          fs.rm(metadataTemp, { force: true }),
        ])
        if (isAlreadyExists(error)) {
          const raced = await this.readVerifiedEntry({
            paths,
            artifact: input.artifact,
            policy: input.policy,
          })
          if (raced !== undefined) return raced
        }
        throw new DependencyArtifactCacheError(
          'DEPENDENCY_CACHE_WRITE_FAILED',
          `Could not commit dependency cache entry: ${errorMessage(error)}`,
        )
      }

      return {
        artifactPath: paths.artifactPath,
        metadataPath: paths.metadataPath,
        provenance,
        cacheHit: false,
      }
    })
  }

  public async getNpmArtifact(input: {
    readonly artifact: NpmDependencyArtifact
    readonly policy: EffectiveDependencyPolicy
  }): Promise<DependencyCacheEntry | undefined> {
    assertArtifactIdentity(input.artifact)
    const paths = this.pathsFor(input.policy.cacheNamespace, input.artifact)
    return this.withKeyLock(paths.lockKey, () =>
      this.readVerifiedEntry({ paths, artifact: input.artifact, policy: input.policy }),
    )
  }

  public async invalidateNpmArtifact(input: {
    readonly artifact: NpmDependencyArtifact
    readonly policy: EffectiveDependencyPolicy
  }): Promise<void> {
    assertArtifactIdentity(input.artifact)
    const paths = this.pathsFor(input.policy.cacheNamespace, input.artifact)
    await this.withKeyLock(paths.lockKey, async () => {
      await Promise.all([
        fs.rm(paths.artifactPath, { force: true }),
        fs.rm(paths.metadataPath, { force: true }),
      ])
    })
  }

  private pathsFor(
    namespace: string,
    artifact: NpmDependencyArtifact,
  ): {
    readonly lockKey: string
    readonly namespaceRoot: string
    readonly algorithmRoot: string
    readonly prefixRoot: string
    readonly artifactPath: string
    readonly metadataPath: string
  } {
    assertSafeSegment(namespace, 'dependency cache namespace')
    assertHexDigest(artifact.integrityDigestHex)
    const namespaceRoot = path.join(this.root, namespace)
    const algorithmRoot = path.join(namespaceRoot, artifact.integrityAlgorithm)
    const prefixRoot = path.join(algorithmRoot, artifact.integrityDigestHex.slice(0, 2))
    const artifactPath = path.join(prefixRoot, `${artifact.integrityDigestHex}.tgz`)
    const metadataPath = path.join(prefixRoot, `${artifact.integrityDigestHex}.json`)
    return {
      lockKey: `${namespace}:${artifact.cacheKey}`,
      namespaceRoot,
      algorithmRoot,
      prefixRoot,
      artifactPath,
      metadataPath,
    }
  }

  private async readVerifiedEntry(input: {
    readonly paths: {
      readonly artifactPath: string
      readonly metadataPath: string
    }
    readonly artifact: NpmDependencyArtifact
    readonly policy: EffectiveDependencyPolicy
  }): Promise<DependencyCacheEntry | undefined> {
    const [artifactStat, metadataStat] = await Promise.all([
      safeLstat(input.paths.artifactPath),
      safeLstat(input.paths.metadataPath),
    ])
    if (artifactStat === undefined && metadataStat === undefined) return undefined
    if (
      artifactStat === undefined ||
      metadataStat === undefined ||
      !artifactStat.isFile() ||
      !metadataStat.isFile() ||
      artifactStat.isSymbolicLink() ||
      metadataStat.isSymbolicLink()
    ) {
      await quarantinePoisonedEntry(input.paths)
      throw new DependencyArtifactCacheError(
        'DEPENDENCY_CACHE_POISONED',
        'Dependency cache entry is incomplete or not a regular file.',
      )
    }
    if (artifactStat.size > input.policy.limits.maxArchiveBytes) {
      await quarantinePoisonedEntry(input.paths)
      throw new DependencyArtifactCacheError(
        'DEPENDENCY_CACHE_POISONED',
        'Cached dependency artifact exceeds the current archive quota.',
      )
    }

    const [bytes, metadataText] = await Promise.all([
      fs.readFile(input.paths.artifactPath),
      fs.readFile(input.paths.metadataPath, 'utf8'),
    ])
    verifyDigest(input.artifact, bytes)
    const provenance = parseProvenance(metadataText)
    if (
      provenance.cacheKey !== input.artifact.cacheKey ||
      provenance.namespace !== input.policy.cacheNamespace ||
      provenance.algorithm !== input.artifact.integrityAlgorithm ||
      provenance.digestHex !== input.artifact.integrityDigestHex ||
      provenance.byteLength !== bytes.byteLength ||
      provenance.policyId !== input.policy.policyId ||
      provenance.policyVersion !== input.policy.policyVersion ||
      provenance.policyFingerprint !== input.policy.fingerprint ||
      provenance.sourceUrlSha256 !== sha256(input.artifact.resolvedUrl)
    ) {
      await quarantinePoisonedEntry(input.paths)
      throw new DependencyArtifactCacheError(
        'DEPENDENCY_CACHE_POISONED',
        'Dependency cache provenance does not match the authorized lockfile and policy.',
      )
    }

    return {
      artifactPath: input.paths.artifactPath,
      metadataPath: input.paths.metadataPath,
      provenance,
      cacheHit: true,
    }
  }

  private async withKeyLock<T>(key: string, action: () => Promise<T>): Promise<T> {
    const predecessor = this.locks.get(key) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = predecessor.then(() => current)
    this.locks.set(key, tail)
    await predecessor
    try {
      return await action()
    } finally {
      release()
      if (this.locks.get(key) === tail) this.locks.delete(key)
    }
  }
}

function verifyDigest(artifact: NpmDependencyArtifact, bytes: Uint8Array): void {
  const actual = createHash(artifact.integrityAlgorithm).update(bytes).digest()
  const expected = Buffer.from(artifact.integrityDigestHex, 'hex')
  if (actual.byteLength !== expected.byteLength || !timingSafeEqual(actual, expected)) {
    throw new DependencyArtifactCacheError(
      'DEPENDENCY_INTEGRITY_MISMATCH',
      `Downloaded artifact integrity does not match lockfile ${artifact.integrityAlgorithm}.`,
    )
  }
}

function parseProvenance(value: string): DependencyCacheProvenance {
  let parsed: unknown
  try {
    parsed = JSON.parse(value) as unknown
  } catch {
    throw new DependencyArtifactCacheError(
      'DEPENDENCY_CACHE_POISONED',
      'Dependency cache provenance is not valid JSON.',
    )
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new DependencyArtifactCacheError(
      'DEPENDENCY_CACHE_POISONED',
      'Dependency cache provenance must be an object.',
    )
  }
  const record = parsed as Record<string, unknown>
  if (
    record['schemaVersion'] !== DEPENDENCY_CACHE_METADATA_SCHEMA_VERSION ||
    typeof record['cacheKey'] !== 'string' ||
    typeof record['namespace'] !== 'string' ||
    (record['algorithm'] !== 'sha256' &&
      record['algorithm'] !== 'sha384' &&
      record['algorithm'] !== 'sha512') ||
    typeof record['digestHex'] !== 'string' ||
    typeof record['byteLength'] !== 'number' ||
    typeof record['packageName'] !== 'string' ||
    typeof record['packageVersion'] !== 'string' ||
    typeof record['sourceUrlSha256'] !== 'string' ||
    typeof record['policyId'] !== 'string' ||
    typeof record['policyVersion'] !== 'number' ||
    typeof record['policyFingerprint'] !== 'string' ||
    typeof record['acquiredAt'] !== 'string'
  ) {
    throw new DependencyArtifactCacheError(
      'DEPENDENCY_CACHE_POISONED',
      'Dependency cache provenance has an invalid schema.',
    )
  }
  return Object.freeze(record as unknown as DependencyCacheProvenance)
}

async function ensureSafeDirectory(directory: string, mode: number): Promise<void> {
  const absolute = path.resolve(directory)
  const filesystemRoot = path.parse(absolute).root
  const segments = path.relative(filesystemRoot, absolute).split(path.sep).filter(Boolean)
  let current = filesystemRoot

  for (const segment of segments) {
    current = path.join(current, segment)
    const existing = await safeLstat(current)
    if (existing !== undefined) {
      assertSafeDirectory(existing, current)
      continue
    }
    try {
      await fs.mkdir(current, { recursive: false, mode })
    } catch (error) {
      if (!isAlreadyExists(error)) throw error
      const raced = await safeLstat(current)
      if (raced === undefined) throw error
      assertSafeDirectory(raced, current)
    }
  }
}

function assertSafeDirectory(
  metadata: Awaited<ReturnType<typeof fs.lstat>>,
  directory: string,
): void {
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new DependencyArtifactCacheError(
      'DEPENDENCY_CACHE_PATH_UNSAFE',
      `Dependency cache path is not a real directory: ${directory}`,
    )
  }
}

async function writeExclusive(filePath: string, bytes: Uint8Array, mode: number): Promise<void> {
  const handle = await fs.open(filePath, 'wx', mode)
  try {
    await handle.writeFile(bytes)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function safeLstat(
  filePath: string,
): Promise<Awaited<ReturnType<typeof fs.lstat>> | undefined> {
  try {
    return await fs.lstat(filePath)
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw error
  }
}

async function quarantinePoisonedEntry(paths: {
  readonly artifactPath: string
  readonly metadataPath: string
}): Promise<void> {
  const suffix = `.poisoned-${Date.now().toString(36)}-${randomSuffix()}`
  await Promise.allSettled([
    renameIfPresent(paths.artifactPath, `${paths.artifactPath}${suffix}`),
    renameIfPresent(paths.metadataPath, `${paths.metadataPath}${suffix}`),
  ])
}

async function renameIfPresent(source: string, target: string): Promise<void> {
  try {
    await fs.rename(source, target)
  } catch (error) {
    if (!isNotFound(error)) throw error
  }
}

function assertArtifactIdentity(artifact: NpmDependencyArtifact): void {
  if (artifact.cacheKey !== `${artifact.integrityAlgorithm}-${artifact.integrityDigestHex}`) {
    throw new DependencyArtifactCacheError(
      'DEPENDENCY_CACHE_KEY_INVALID',
      'Dependency cache key must equal the lockfile integrity algorithm and digest.',
    )
  }
  assertHexDigest(artifact.integrityDigestHex)
}

function assertHexDigest(value: string): void {
  if (!/^[a-f0-9]+$/.test(value) || value.length % 2 !== 0) {
    throw new DependencyArtifactCacheError(
      'DEPENDENCY_DIGEST_INVALID',
      'Dependency integrity digest must be lowercase hexadecimal bytes.',
    )
  }
}

function assertSafeSegment(value: string, label: string): void {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value) || value === '.' || value === '..') {
    throw new DependencyArtifactCacheError(
      'DEPENDENCY_CACHE_PATH_UNSAFE',
      `${label} contains unsafe path characters.`,
    )
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function randomSuffix(): string {
  return createHash('sha256')
    .update(`${process.hrtime.bigint()}:${Math.random()}`)
    .digest('hex')
    .slice(0, 12)
}

function isNotFound(error: unknown): boolean {
  return isNodeError(error) && error.code === 'ENOENT'
}

function isAlreadyExists(error: unknown): boolean {
  return isNodeError(error) && error.code === 'EEXIST'
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
