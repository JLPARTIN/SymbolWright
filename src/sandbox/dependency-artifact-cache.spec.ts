import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { EffectiveDependencyPolicy } from './dependency-policy.js'
import {
  DependencyArtifactCache,
  DependencyArtifactCacheError,
} from './dependency-artifact-cache.js'
import type { NpmDependencyArtifact } from './npm-dependency-plan.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

async function createCache(): Promise<{
  readonly root: string
  readonly cache: DependencyArtifactCache
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'symbolwright-dependency-cache-'))
  roots.push(root)
  return {
    root,
    cache: new DependencyArtifactCache({
      root: path.join(root, 'cache'),
      now: () => new Date('2026-07-29T00:00:00.000Z'),
    }),
  }
}

function fixture(bytes: Uint8Array = Buffer.from('fixture tarball')): {
  readonly bytes: Uint8Array
  readonly artifact: NpmDependencyArtifact
} {
  const digestHex = createHash('sha512').update(bytes).digest('hex')
  return {
    bytes,
    artifact: {
      packagePath: 'node_modules/fixture',
      name: 'fixture',
      version: '1.2.3',
      resolvedUrl: 'https://registry.npmjs.org/fixture/-/fixture-1.2.3.tgz',
      integrity: `sha512-${Buffer.from(digestHex, 'hex').toString('base64')}`,
      integrityAlgorithm: 'sha512',
      integrityDigestHex: digestHex,
      cacheKey: `sha512-${digestHex}`,
      hasInstallScript: false,
      development: false,
      optional: false,
    },
  }
}

function policy(
  overrides: Partial<EffectiveDependencyPolicy['limits']> = {},
): EffectiveDependencyPolicy {
  return {
    schemaVersion: 1,
    policyId: 'npm-production',
    policyVersion: 3,
    fingerprint: 'a'.repeat(64),
    resolvedAt: '2026-07-29T00:00:00.000Z',
    ecosystem: 'npm',
    deploymentMode: 'hosted',
    callerKind: 'delegated-grant',
    capabilityId: 'symbolwright.dependencies.acquire',
    allowedRegistries: ['https://registry.npmjs.org/'],
    requireLockfile: true,
    allowLockfileMutation: false,
    suppressLifecycleScripts: true,
    directIpDestinations: 'denied',
    cacheNamespace: 'npm-production-v3',
    limits: {
      maxPackages: 100,
      maxRequests: 100,
      maxArchiveBytes: 1_000_000,
      maxExpandedBytes: 10_000_000,
      maxFiles: 1_000,
      maxFileBytes: 1_000_000,
      maxTotalBytes: 20_000_000,
      timeoutMs: 60_000,
      maxConcurrency: 2,
      ...overrides,
    },
    sources: [
      { id: 'dependency-global', version: 1, kind: 'global' },
      { id: 'npm-production', version: 3, kind: 'operator-profile' },
    ],
  }
}

describe('dependency artifact cache', () => {
  it('stores a verified artifact atomically and returns a validated cache hit', async () => {
    const { cache } = await createCache()
    const { artifact, bytes } = fixture()

    const stored = await cache.putNpmArtifact({ artifact, bytes, policy: policy() })
    const hit = await cache.getNpmArtifact({ artifact, policy: policy() })

    expect(stored.cacheHit).toBe(false)
    expect(hit?.cacheHit).toBe(true)
    expect(hit?.provenance).toMatchObject({
      cacheKey: artifact.cacheKey,
      namespace: 'npm-production-v3',
      byteLength: bytes.byteLength,
      packageName: artifact.name,
      packageVersion: artifact.version,
      policyId: 'npm-production',
      policyVersion: 3,
    })
    await expect(fs.readFile(stored.artifactPath)).resolves.toEqual(Buffer.from(bytes))
  })

  it('deduplicates concurrent writes to the same integrity identity', async () => {
    const { cache } = await createCache()
    const { artifact, bytes } = fixture()

    const results = await Promise.all(
      Array.from({ length: 8 }, () => cache.putNpmArtifact({ artifact, bytes, policy: policy() })),
    )

    expect(results.filter((entry) => !entry.cacheHit)).toHaveLength(1)
    expect(results.filter((entry) => entry.cacheHit)).toHaveLength(7)
    expect(new Set(results.map((entry) => entry.artifactPath)).size).toBe(1)
  })

  it('rejects bytes whose digest does not match the lockfile integrity', async () => {
    const { cache } = await createCache()
    const { artifact } = fixture()

    await expect(
      cache.putNpmArtifact({
        artifact,
        bytes: Buffer.from('tampered'),
        policy: policy(),
      }),
    ).rejects.toMatchObject({
      code: 'DEPENDENCY_INTEGRITY_MISMATCH',
    })
  })

  it('enforces the current archive quota before writing to disk', async () => {
    const { cache } = await createCache()
    const { artifact, bytes } = fixture(Buffer.alloc(64, 1))

    await expect(
      cache.putNpmArtifact({ artifact, bytes, policy: policy({ maxArchiveBytes: 32 }) }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_ARCHIVE_QUOTA_EXCEEDED' })
  })

  it('detects and quarantines cache artifact poisoning', async () => {
    const { cache } = await createCache()
    const { artifact, bytes } = fixture()
    const stored = await cache.putNpmArtifact({ artifact, bytes, policy: policy() })
    await fs.writeFile(stored.artifactPath, 'poison')

    await expect(cache.getNpmArtifact({ artifact, policy: policy() })).rejects.toMatchObject({
      code: 'DEPENDENCY_INTEGRITY_MISMATCH',
    })
  })

  it('detects provenance poisoning and invalidates entries explicitly', async () => {
    const { cache } = await createCache()
    const { artifact, bytes } = fixture()
    const stored = await cache.putNpmArtifact({ artifact, bytes, policy: policy() })
    const metadata = JSON.parse(await fs.readFile(stored.metadataPath, 'utf8')) as Record<
      string,
      unknown
    >
    metadata['policyFingerprint'] = 'b'.repeat(64)
    await fs.writeFile(stored.metadataPath, JSON.stringify(metadata))

    await expect(cache.getNpmArtifact({ artifact, policy: policy() })).rejects.toMatchObject({
      code: 'DEPENDENCY_CACHE_POISONED',
    })

    await cache.invalidateNpmArtifact({ artifact, policy: policy() })
    await expect(cache.getNpmArtifact({ artifact, policy: policy() })).resolves.toBeUndefined()
  })

  it('rejects unsafe cache namespaces and symlinked cache roots', async () => {
    const { root } = await createCache()
    const target = path.join(root, 'target')
    const symlinkRoot = path.join(root, 'linked-cache')
    await fs.mkdir(target)
    await fs.symlink(target, symlinkRoot)
    const cache = new DependencyArtifactCache({ root: symlinkRoot })
    const { artifact, bytes } = fixture()

    await expect(cache.putNpmArtifact({ artifact, bytes, policy: policy() })).rejects.toMatchObject(
      { code: 'DEPENDENCY_CACHE_PATH_UNSAFE' },
    )

    const unsafePolicy = { ...policy(), cacheNamespace: '../escape' }
    await expect(
      new DependencyArtifactCache({ root: path.join(root, 'safe-cache') }).putNpmArtifact({
        artifact,
        bytes,
        policy: unsafePolicy,
      }),
    ).rejects.toBeInstanceOf(DependencyArtifactCacheError)
  })
})
