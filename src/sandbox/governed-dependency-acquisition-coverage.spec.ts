import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  DependencyAcquisitionReport,
  DependencyAcquisitionSession,
  DependencyAcquisitionStatus,
} from './dependency-acquisition-service.js'
import {
  acquireGovernedNpmDependencies,
  parseGovernedDependencyAcquisitionRequest,
  renderGovernedDependencyAcquisitionResult,
} from './governed-dependency-acquisition.js'
import type { NpmDependencyPlan } from './npm-dependency-plan.js'
import type { StrongSandboxDependencyLayer } from './npm-dependency-layer.js'
import type { SandboxAuthorizationContext } from './sandbox-policy-model.js'
import type { ApplicationSandboxNetworkRuntime } from './sandbox-network-runtime.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('parseGovernedDependencyAcquisitionRequest branch coverage', () => {
  it.each([null, [], 'request', 1])('rejects non-object input %j', (input) => {
    expect(() => parseGovernedDependencyAcquisitionRequest(input)).toThrow(
      'dependency_acquire input must be a JSON object.',
    )
  })

  it('rejects caller-controlled authority and unknown fields', () => {
    expect(() => parseGovernedDependencyAcquisitionRequest({ grantId: 'caller-grant' })).toThrow(
      'dependency_acquire rejects caller-controlled authority field: grantId',
    )
    expect(() => parseGovernedDependencyAcquisitionRequest({ surprise: true })).toThrow(
      'dependency_acquire rejects unknown request field: surprise',
    )
  })

  it('validates registry URL arrays', () => {
    expect(() => parseGovernedDependencyAcquisitionRequest({ registryUrls: 'npm' })).toThrow(
      'registryUrls must be an array of strings.',
    )
    expect(() => parseGovernedDependencyAcquisitionRequest({ registryUrls: ['npm', 1] })).toThrow(
      'registryUrls must be an array of strings.',
    )
    expect(
      parseGovernedDependencyAcquisitionRequest({
        registryUrls: ['https://registry.npmjs.org/'],
      }),
    ).toEqual({ registryUrls: ['https://registry.npmjs.org/'] })
  })

  it.each([null, [], 'limits'])('rejects non-object limits %j', (limits) => {
    expect(() => parseGovernedDependencyAcquisitionRequest({ limits })).toThrow(
      'limits must be a JSON object.',
    )
  })

  it('rejects unknown, non-finite, non-numeric, and non-positive limits', () => {
    expect(() => parseGovernedDependencyAcquisitionRequest({ limits: { surprise: 1 } })).toThrow(
      'Unknown dependency limit: surprise',
    )
    expect(() => parseGovernedDependencyAcquisitionRequest({ limits: { maxPackages: '1' } })).toThrow(
      'Dependency limit maxPackages must be a positive number.',
    )
    expect(() =>
      parseGovernedDependencyAcquisitionRequest({ limits: { maxPackages: Number.POSITIVE_INFINITY } }),
    ).toThrow('Dependency limit maxPackages must be a positive number.')
    expect(() => parseGovernedDependencyAcquisitionRequest({ limits: { maxPackages: 0 } })).toThrow(
      'Dependency limit maxPackages must be a positive number.',
    )
  })

  it('omits absent options and floors valid positive limits', () => {
    expect(parseGovernedDependencyAcquisitionRequest({})).toEqual({})
    expect(
      parseGovernedDependencyAcquisitionRequest({
        limits: { maxPackages: 3.9, timeoutMs: 100.8 },
      }),
    ).toEqual({ limits: { maxPackages: 3, timeoutMs: 100 } })
  })
})

describe('acquireGovernedNpmDependencies branch coverage', () => {
  it('returns a blocked acquisition without materializing or binding a layer', async () => {
    const workspaceRoot = await workspace()
    const blocked = session('blocked')
    const harness = runtimeHarness(blocked)

    await expect(
      acquireGovernedNpmDependencies({
        workspaceRoot,
        runtime: harness.runtime,
        authorization: authorization(),
      }),
    ).resolves.toEqual({ session: blocked })

    expect(harness.acquireNpm).toHaveBeenCalledWith({
      packageJsonText: '{"name":"fixture"}\n',
      packageLockText: '{"lockfileVersion":3}\n',
      authorization: authorization(),
    })
    expect(harness.materializeNpmLayer).not.toHaveBeenCalled()
    expect(harness.bind).not.toHaveBeenCalled()
  })

  it('returns a completed acquisition when no materialization plan is present', async () => {
    const completedWithoutPlan = session('completed')
    const harness = runtimeHarness(completedWithoutPlan)

    await expect(
      acquireGovernedNpmDependencies({
        workspaceRoot: await workspace(),
        runtime: harness.runtime,
        authorization: authorization(),
      }),
    ).resolves.toEqual({ session: completedWithoutPlan })
  })

  it('materializes and binds a completed plan while forwarding optional request and cancellation', async () => {
    const completed = session('completed', { includePlan: true })
    const layer = dependencyLayer()
    const harness = runtimeHarness(completed, layer)
    const signal = new AbortController().signal
    const request = { limits: { maxPackages: 2 } }

    const result = await acquireGovernedNpmDependencies({
      workspaceRoot: await workspace(),
      runtime: harness.runtime,
      authorization: authorization(),
      request,
      signal,
    })

    expect(harness.acquireNpm).toHaveBeenCalledWith(
      expect.objectContaining({ request, signal, authorization: authorization() }),
    )
    expect(harness.materializeNpmLayer).toHaveBeenCalledWith(
      expect.stringMatching(/^npm-[a-f0-9]{32}$/),
      completed,
    )
    expect(harness.bind).toHaveBeenCalledWith('workspace-1', layer)
    expect(result).toEqual({ session: completed, layer, bindingPath: '/state/bindings/workspace-1.json' })
  })

  it('rejects symbolic-link, directory, and oversized manifests', async () => {
    const authorizationContext = authorization()
    const harness = runtimeHarness(session('blocked'))

    const symlinkRoot = await temporaryRoot()
    await fs.writeFile(path.join(symlinkRoot, 'real-package.json'), '{}', 'utf8')
    await fs.symlink('real-package.json', path.join(symlinkRoot, 'package.json'))
    await fs.writeFile(path.join(symlinkRoot, 'package-lock.json'), '{}', 'utf8')
    await expect(
      acquireGovernedNpmDependencies({
        workspaceRoot: symlinkRoot,
        runtime: harness.runtime,
        authorization: authorizationContext,
      }),
    ).rejects.toThrow('package.json must be a regular file in the authorized workspace.')

    const directoryRoot = await temporaryRoot()
    await fs.mkdir(path.join(directoryRoot, 'package.json'))
    await fs.writeFile(path.join(directoryRoot, 'package-lock.json'), '{}', 'utf8')
    await expect(
      acquireGovernedNpmDependencies({
        workspaceRoot: directoryRoot,
        runtime: harness.runtime,
        authorization: authorizationContext,
      }),
    ).rejects.toThrow('package.json must be a regular file in the authorized workspace.')

    const oversizedRoot = await temporaryRoot()
    await fs.writeFile(path.join(oversizedRoot, 'package.json'), Buffer.alloc(8 * 1024 * 1024 + 1))
    await fs.writeFile(path.join(oversizedRoot, 'package-lock.json'), '{}', 'utf8')
    await expect(
      acquireGovernedNpmDependencies({
        workspaceRoot: oversizedRoot,
        runtime: harness.runtime,
        authorization: authorizationContext,
      }),
    ).rejects.toThrow('package.json exceeds the 8388608-byte limit.')
  })
})

describe('renderGovernedDependencyAcquisitionResult branch coverage', () => {
  it('omits optional policy and layer fields when unavailable', () => {
    const rendered = JSON.parse(renderGovernedDependencyAcquisitionResult({ session: session('blocked') }))

    expect(rendered).not.toHaveProperty('policy')
    expect(rendered).not.toHaveProperty('dependencyLayer')
  })

  it('renders policy and immutable layer summaries when present', () => {
    const completed = session('completed', { includePolicy: true })
    const layer = dependencyLayer()
    const rendered = JSON.parse(
      renderGovernedDependencyAcquisitionResult({ session: completed, layer }),
    )

    expect(rendered.policy).toEqual({
      id: 'npm-controlled',
      version: 1,
      fingerprint: 'policy-fingerprint',
    })
    expect(rendered.dependencyLayer).toEqual({
      layerId: 'layer-1',
      packageCount: 1,
      fileCount: 2,
      totalBytes: 32,
      manifestSha256: 'd'.repeat(64),
      packageLockSha256: 'c'.repeat(64),
    })
  })
})

async function workspace(): Promise<string> {
  const root = await temporaryRoot()
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"fixture"}\n', 'utf8')
  await fs.writeFile(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}\n', 'utf8')
  return root
}

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'symbolwright-governed-dependency-'))
  roots.push(root)
  return root
}

function runtimeHarness(sessionResult: DependencyAcquisitionSession, layer = dependencyLayer()): {
  readonly runtime: ApplicationSandboxNetworkRuntime
  readonly acquireNpm: ReturnType<typeof vi.fn>
  readonly materializeNpmLayer: ReturnType<typeof vi.fn>
  readonly bind: ReturnType<typeof vi.fn>
} {
  const acquireNpm = vi.fn().mockResolvedValue(sessionResult)
  const materializeNpmLayer = vi.fn().mockResolvedValue(layer)
  const bind = vi.fn().mockResolvedValue('/state/bindings/workspace-1.json')
  return {
    runtime: {
      gateway: { acquireNpm, materializeNpmLayer },
      dependencyLayers: { bind },
    } as unknown as ApplicationSandboxNetworkRuntime,
    acquireNpm,
    materializeNpmLayer,
    bind,
  }
}

function authorization(): SandboxAuthorizationContext {
  return { workspaceId: 'workspace-1' } as SandboxAuthorizationContext
}

function session(
  status: DependencyAcquisitionStatus,
  options: { readonly includePlan?: boolean; readonly includePolicy?: boolean } = {},
): DependencyAcquisitionSession {
  const report: DependencyAcquisitionReport = {
    schemaVersion: 1,
    acquisitionId: `dependency-${status}`,
    status,
    ecosystem: 'npm',
    startedAt: '2026-07-30T00:00:00.000Z',
    completedAt: '2026-07-30T00:00:01.000Z',
    durationMs: 1_000,
    decisionCode: 'TEST',
    reason: 'test report',
    ...(options.includePolicy
      ? {
          policy: {
            id: 'npm-controlled',
            version: 1,
            fingerprint: 'policy-fingerprint',
          },
        }
      : {}),
    packageJsonSha256: 'b'.repeat(64),
    packageCount: 1,
    cacheHits: 0,
    networkRequests: 0,
    archiveBytes: 0,
    expandedBytes: 0,
    fileCount: 0,
    artifacts: [],
    evidenceSha256: 'e'.repeat(64),
  }
  return {
    report,
    acquiredArtifacts: [],
    ...(options.includePlan ? { plan: {} as NpmDependencyPlan } : {}),
  }
}

function dependencyLayer(): StrongSandboxDependencyLayer {
  return {
    schemaVersion: 1,
    layerId: 'layer-1',
    ecosystem: 'npm',
    rootPath: '/state/layer-1',
    nodeModulesPath: '/state/layer-1/node_modules',
    manifestPath: '/state/layer-1/manifest.json',
    sbomPath: '/state/layer-1/sbom.json',
    policyId: 'npm-controlled',
    policyVersion: 1,
    policyFingerprint: 'policy-fingerprint',
    packageJsonSha256: 'b'.repeat(64),
    packageLockSha256: 'c'.repeat(64),
    packageCount: 1,
    fileCount: 2,
    totalBytes: 32,
    manifestSha256: 'd'.repeat(64),
  }
}
