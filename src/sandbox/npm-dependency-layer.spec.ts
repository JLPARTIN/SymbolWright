import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

import { afterEach, describe, expect, it } from 'vitest'

import { SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY } from '../access/sandbox-capabilities.js'
import { DependencyAcquisitionService } from './dependency-acquisition-service.js'
import { DependencyHttpsFetcher } from './dependency-https-fetcher.js'
import {
  DEFAULT_DEPENDENCY_ACQUISITION_LIMITS,
  DEPENDENCY_GLOBAL_POLICY_ID,
  DependencyPolicyCatalog,
  type DependencyPolicyProfile,
} from './dependency-policy.js'
import {
  cleanupNpmDependencyLayer,
  materializeNpmDependencyLayer,
  verifyNpmDependencyLayer,
} from './npm-dependency-layer.js'
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
  limits: DEFAULT_DEPENDENCY_ACQUISITION_LIMITS,
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
    grantVersion: 1,
    policyReference: { id: PROFILE.id, version: PROFILE.version },
    approval: {
      id: 'approval-1',
      capabilityId: SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
      grantVersion: 1,
      policyVersions: {
        [DEPENDENCY_GLOBAL_POLICY_ID]: 1,
        [PROFILE.id]: 1,
        'grant:grant-1': 1,
        'mission:mission-1': 1,
        'dependency-request-tightening': 1,
      },
    },
  }
}

describe('npm dependency layer', () => {
  it('materializes regular files and bin shims without running lifecycle scripts', async () => {
    const data = await createAcquisitionFixture({ packageName: 'alpha', packageVersion: '1.2.3' })
    const acquisition = await data.service.acquireNpm({
      packageJsonText: data.packageJsonText,
      packageLockText: data.packageLockText,
      authorization: authorization(),
    })

    const layer = await materializeNpmDependencyLayer({
      layerId: 'layer-fixture',
      acquisition,
      stateRoot: path.join(data.root, 'layer-state'),
    })

    await expect(
      fs.readFile(path.join(layer.nodeModulesPath, 'alpha', 'index.js'), 'utf8'),
    ).resolves.toContain('module.exports')
    await expect(
      fs.readFile(path.join(layer.nodeModulesPath, '.bin', 'alpha-cli'), 'utf8'),
    ).resolves.toContain('spawnSync')
    await expect(
      fs.stat(path.join(layer.nodeModulesPath, 'alpha', 'INSTALL_SCRIPT_RAN')),
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(verifyNpmDependencyLayer(layer)).resolves.toMatchObject({
      layerId: 'layer-fixture',
      packageCount: 1,
    })
    expect(layer.manifestSha256).toMatch(/^[a-f0-9]{64}$/)

    await cleanupNpmDependencyLayer(layer)
    await expect(fs.stat(layer.rootPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('detects content drift after materialization', async () => {
    const data = await createAcquisitionFixture({ packageName: 'alpha', packageVersion: '1.2.3' })
    const acquisition = await data.service.acquireNpm({
      packageJsonText: data.packageJsonText,
      packageLockText: data.packageLockText,
      authorization: authorization(),
    })
    const layer = await materializeNpmDependencyLayer({
      layerId: 'layer-drift',
      acquisition,
      stateRoot: path.join(data.root, 'layer-state'),
    })
    await fs.writeFile(path.join(layer.nodeModulesPath, 'alpha', 'index.js'), 'tampered')

    await expect(verifyNpmDependencyLayer(layer)).rejects.toMatchObject({
      code: 'DEPENDENCY_LAYER_CONTENT_DRIFT',
    })
  })

  it('rejects extracted identity that differs from package-lock.json', async () => {
    const data = await createAcquisitionFixture({
      packageName: 'wrong-name',
      packageVersion: '1.2.3',
      lockName: 'alpha',
    })
    const acquisition = await data.service.acquireNpm({
      packageJsonText: data.packageJsonText,
      packageLockText: data.packageLockText,
      authorization: authorization(),
    })

    await expect(
      materializeNpmDependencyLayer({
        layerId: 'layer-wrong-identity',
        acquisition,
        stateRoot: path.join(data.root, 'layer-state'),
      }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_LAYER_PACKAGE_IDENTITY_MISMATCH' })
  })
})

async function createAcquisitionFixture(options: {
  readonly packageName: string
  readonly packageVersion: string
  readonly lockName?: string
}): Promise<{
  readonly root: string
  readonly service: DependencyAcquisitionService
  readonly packageJsonText: string
  readonly packageLockText: string
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'symbolwright-layer-test-'))
  roots.push(root)
  const lockName = options.lockName ?? options.packageName
  const packageManifest = JSON.stringify({
    name: options.packageName,
    version: options.packageVersion,
    bin: { 'alpha-cli': 'cli.js' },
    scripts: { install: "node -e \"require('fs').writeFileSync('INSTALL_SCRIPT_RAN','bad')\"" },
  })
  const archive = tarGzip([
    { name: 'package/', type: 'directory' },
    { name: 'package/package.json', content: packageManifest },
    { name: 'package/index.js', content: 'module.exports = 42\n' },
    { name: 'package/cli.js', content: 'console.log("cli")\n', executable: true },
  ])
  const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`
  const packageJsonText = JSON.stringify({
    name: 'fixture-app',
    version: '1.0.0',
    dependencies: { [lockName]: '^1.0.0' },
  })
  const packageLockText = JSON.stringify({
    name: 'fixture-app',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'fixture-app',
        version: '1.0.0',
        dependencies: { [lockName]: '^1.0.0' },
      },
      [`node_modules/${lockName}`]: {
        name: lockName,
        version: options.packageVersion,
        resolved: `https://registry.npmjs.org/${lockName}/-/${lockName}-${options.packageVersion}.tgz`,
        integrity,
      },
    },
  })
  const service = new DependencyAcquisitionService({
    catalog: new DependencyPolicyCatalog([PROFILE]),
    fetcher: new DependencyHttpsFetcher({
      resolver: { resolve: async () => [{ address: '104.16.24.34', family: 4 }] },
      requester: { get: async () => ({ statusCode: 200, headers: {}, body: archive }) },
    }),
    stateRoot: path.join(root, 'acquisition-state'),
  })
  return { root, service, packageJsonText, packageLockText }
}

interface TarEntry {
  readonly name: string
  readonly type?: 'file' | 'directory'
  readonly content?: string
  readonly executable?: boolean
}

function tarGzip(entries: readonly TarEntry[]): Buffer {
  const blocks: Buffer[] = []
  for (const entry of entries) {
    const content = Buffer.from(entry.content ?? '')
    const header = Buffer.alloc(512)
    writeText(header, 0, 100, entry.name)
    writeOctal(
      header,
      100,
      8,
      entry.type === 'directory' ? 0o755 : entry.executable === true ? 0o755 : 0o644,
    )
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
