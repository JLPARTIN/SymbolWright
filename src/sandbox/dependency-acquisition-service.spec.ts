import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY } from '../access/sandbox-capabilities.js'
import {
  DependencyAcquisitionService,
  type DependencyAcquisitionSession,
} from './dependency-acquisition-service.js'
import { DependencyHttpsFetcher } from './dependency-https-fetcher.js'
import {
  DEFAULT_DEPENDENCY_ACQUISITION_LIMITS,
  DEPENDENCY_GLOBAL_POLICY_ID,
  DependencyPolicyCatalog,
  type DependencyPolicyProfile,
} from './dependency-policy.js'
import type { SandboxAuthorizationContext } from './sandbox-policy-model.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

const PROFILE: DependencyPolicyProfile = {
  id: 'npm-production',
  version: 1,
  enabled: true,
  ecosystems: ['npm'],
  deploymentModes: ['hosted'],
  callerKinds: ['delegated-grant'],
  allowedRegistries: ['https://registry.npmjs.org/'],
  requireLockfile: true,
  allowLockfileMutation: false,
  suppressLifecycleScripts: true,
  directIpDestinations: 'denied',
  cacheNamespace: 'npm-production-v1',
  limits: { ...DEFAULT_DEPENDENCY_ACQUISITION_LIMITS, maxConcurrency: 2 },
}

function authorization(): SandboxAuthorizationContext {
  return {
    deploymentMode: 'hosted',
    callerKind: 'delegated-grant',
    runtimeMode: 'APPROVED_EXECUTION',
    approvedCapabilityIds: [SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY],
    repositoryId: 'repo-1',
    workspaceId: 'workspace-1',
    missionId: 'mission-1',
    grantId: 'grant-1',
    grantVersion: 2,
    policyReference: { id: PROFILE.id, version: PROFILE.version },
    approval: {
      id: 'approval-1',
      capabilityId: SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
      grantVersion: 2,
      policyVersions: {
        [DEPENDENCY_GLOBAL_POLICY_ID]: 1,
        [PROFILE.id]: PROFILE.version,
        'grant:grant-1': 2,
        'mission:mission-1': 1,
        'dependency-request-tightening': 1,
      },
    },
  }
}

async function fixture(): Promise<{
  readonly root: string
  readonly packageJsonText: string
  readonly packageLockText: string
  readonly archive: Buffer
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'symbolwright-acquisition-service-'))
  roots.push(root)
  const packageJsonText = JSON.stringify({
    name: 'fixture-app',
    version: '1.0.0',
    dependencies: { alpha: '^1.0.0' },
  })
  const archive = tarGzip([
    { name: 'package/', type: 'directory' },
    { name: 'package/package.json', content: '{"name":"alpha","version":"1.2.3"}' },
    { name: 'package/index.js', content: 'module.exports = 42\n' },
  ])
  const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`
  const packageLockText = JSON.stringify({
    name: 'fixture-app',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'fixture-app',
        version: '1.0.0',
        dependencies: { alpha: '^1.0.0' },
      },
      'node_modules/alpha': {
        name: 'alpha',
        version: '1.2.3',
        resolved: 'https://registry.npmjs.org/alpha/-/alpha-1.2.3.tgz',
        integrity,
      },
    },
  })
  return { root, packageJsonText, packageLockText, archive }
}

describe('dependency acquisition service', () => {
  it('fetches, inspects, caches, and durably records an immutable npm acquisition', async () => {
    const data = await fixture()
    const requester = {
      get: vi.fn(async () => ({
        statusCode: 200,
        headers: {},
        body: data.archive,
      })),
    }
    const fetcher = new DependencyHttpsFetcher({
      resolver: {
        resolve: async () => [{ address: '104.16.24.34', family: 4 }],
      },
      requester,
    })
    let id = 0
    const service = new DependencyAcquisitionService({
      catalog: new DependencyPolicyCatalog([PROFILE]),
      fetcher,
      stateRoot: path.join(data.root, 'state'),
      now: () => new Date('2026-07-29T02:00:00.000Z'),
      generateAcquisitionId: () => `dependency_fixture_${++id}`,
    })

    const first = await service.acquireNpm({
      packageJsonText: data.packageJsonText,
      packageLockText: data.packageLockText,
      authorization: authorization(),
    })
    const second = await service.acquireNpm({
      packageJsonText: data.packageJsonText,
      packageLockText: data.packageLockText,
      authorization: authorization(),
    })

    expect(first.report).toMatchObject({
      status: 'completed',
      decisionCode: 'DEPENDENCY_ACQUISITION_COMPLETED',
      packageCount: 1,
      cacheHits: 0,
      networkRequests: 1,
    })
    expect(second.report).toMatchObject({
      status: 'completed',
      packageCount: 1,
      cacheHits: 1,
      networkRequests: 0,
    })
    expect(first.acquiredArtifacts).toHaveLength(1)
    expect(first.report.evidenceSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(first.evidencePath).toBeDefined()
    await expect(fs.readFile(first.evidencePath!, 'utf8')).resolves.not.toContain(
      '104.16.24.34',
    )
    expect(requester.get).toHaveBeenCalledTimes(1)
  })

  it('returns a blocked report before parsing or network access when authority is absent', async () => {
    const data = await fixture()
    const requester = { get: vi.fn() }
    const service = new DependencyAcquisitionService({
      catalog: new DependencyPolicyCatalog([PROFILE]),
      fetcher: new DependencyHttpsFetcher({
        resolver: { resolve: async () => [{ address: '104.16.24.34', family: 4 }] },
        requester,
      }),
      stateRoot: path.join(data.root, 'state'),
    })
    const { approval, ...missingApproval } = authorization()
    void approval

    const result = await service.acquireNpm({
      packageJsonText: data.packageJsonText,
      packageLockText: data.packageLockText,
      authorization: missingApproval,
    })

    expect(result.report).toMatchObject({
      status: 'blocked',
      decisionCode: 'DEPENDENCY_APPROVAL_REQUIRED',
      packageCount: 0,
    })
    expect(requester.get).not.toHaveBeenCalled()
  })

  it('fails closed on lockfile integrity mismatch without admitting cache content', async () => {
    const data = await fixture()
    const tampered = Buffer.from(data.archive)
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1
    const service = new DependencyAcquisitionService({
      catalog: new DependencyPolicyCatalog([PROFILE]),
      fetcher: new DependencyHttpsFetcher({
        resolver: { resolve: async () => [{ address: '104.16.24.34', family: 4 }] },
        requester: {
          get: async () => ({ statusCode: 200, headers: {}, body: tampered }),
        },
      }),
      stateRoot: path.join(data.root, 'state'),
    })

    const result = await service.acquireNpm({
      packageJsonText: data.packageJsonText,
      packageLockText: data.packageLockText,
      authorization: authorization(),
    })

    expect(result.report.status).toBe('failed')
    expect(result.report.decisionCode).toMatch(
      /DEPENDENCY_(ARCHIVE_INVALID|INTEGRITY_MISMATCH)/,
    )
    expect(result.acquiredArtifacts).toHaveLength(0)
  })

  it('records cancellation without making a dependency request', async () => {
    const data = await fixture()
    const requester = { get: vi.fn() }
    const service = new DependencyAcquisitionService({
      catalog: new DependencyPolicyCatalog([PROFILE]),
      fetcher: new DependencyHttpsFetcher({
        resolver: { resolve: async () => [{ address: '104.16.24.34', family: 4 }] },
        requester,
      }),
      stateRoot: path.join(data.root, 'state'),
    })
    const controller = new AbortController()
    controller.abort()

    const result: DependencyAcquisitionSession = await service.acquireNpm({
      packageJsonText: data.packageJsonText,
      packageLockText: data.packageLockText,
      authorization: authorization(),
      signal: controller.signal,
    })

    expect(result.report).toMatchObject({
      status: 'cancelled',
      decisionCode: 'DEPENDENCY_ACQUISITION_CANCELLED',
    })
    expect(requester.get).not.toHaveBeenCalled()
  })
})

interface TarFixtureEntry {
  readonly name: string
  readonly type?: 'file' | 'directory'
  readonly content?: string
}

function tarGzip(entries: readonly TarFixtureEntry[]): Buffer {
  const blocks: Buffer[] = []
  for (const entry of entries) {
    const content = Buffer.from(entry.content ?? '')
    const header = Buffer.alloc(512)
    writeText(header, 0, 100, entry.name)
    writeOctal(header, 100, 8, entry.type === 'directory' ? 0o755 : 0o644)
    writeOctal(header, 108, 8, 0)
    writeOctal(header, 116, 8, 0)
    writeOctal(header, 124, 12, entry.type === 'directory' ? 0 : content.byteLength)
    writeOctal(header, 136, 12, 0)
    header.fill(32, 148, 156)
    header[156] = entry.type === 'directory' ? 53 : 48
    writeText(header, 257, 6, 'ustar')
    writeText(header, 263, 2, '00')
    const checksum = header.reduce((sum, byte) => sum + byte, 0)
    header.write(checksum.toString(8).padStart(6, '0'), 148, 6, 'ascii')
    header[154] = 0
    header[155] = 32
    blocks.push(header)
    if (entry.type !== 'directory' && content.byteLength > 0) {
      const padded = Buffer.alloc(Math.ceil(content.byteLength / 512) * 512)
      content.copy(padded)
      blocks.push(padded)
    }
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks))
}

function writeText(buffer: Buffer, offset: number, length: number, value: string): void {
  Buffer.from(value, 'utf8').copy(buffer, offset, 0, length)
}

function writeOctal(buffer: Buffer, offset: number, length: number, value: number): void {
  buffer.write(value.toString(8).padStart(length - 1, '0'), offset, length - 1, 'ascii')
  buffer[offset + length - 1] = 0
}
