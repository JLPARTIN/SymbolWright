import { describe, expect, it } from 'vitest'

import { buildSandboxContainerCommandPlan } from './sandbox-container-command-plan.js'
import { runWithSandboxDependencyLayer } from './sandbox-dependency-execution-context.js'
import { DEFAULT_SANDBOX_IMAGE_ALLOWLIST } from './sandbox-images.js'
import type { StrongSandboxDependencyLayer } from './npm-dependency-layer.js'

const LAYER: StrongSandboxDependencyLayer = {
  schemaVersion: 1,
  layerId: 'npm-layer-1',
  ecosystem: 'npm',
  rootPath: '/tmp/symbolwright-dependency-layers/npm-layer-1',
  nodeModulesPath: '/tmp/symbolwright-dependency-layers/npm-layer-1/node_modules',
  manifestPath: '/tmp/symbolwright-dependency-layers/npm-layer-1/manifest.json',
  sbomPath: '/tmp/symbolwright-dependency-layers/npm-layer-1/sbom.cdx.json',
  policyId: 'npm-controlled',
  policyVersion: 1,
  policyFingerprint: 'a'.repeat(64),
  packageJsonSha256: 'b'.repeat(64),
  packageLockSha256: 'c'.repeat(64),
  packageCount: 1,
  fileCount: 2,
  totalBytes: 128,
  manifestSha256: 'd'.repeat(64),
}

function buildPlan() {
  return buildSandboxContainerCommandPlan({
    image: { ...DEFAULT_SANDBOX_IMAGE_ALLOWLIST[0]!, enabled: true, installed: true },
    engine: {
      engine: 'docker',
      status: 'available',
      version: '27.0.0',
      reason: 'docker is available',
    },
    hostWorkspacePath: '/tmp/symbolwright-sandbox/input',
    hostOutputPath: '/tmp/symbolwright-sandbox/output',
    containerName: 'symbolwright-sandbox-dependency-test',
    entrypoint: ['node', '/workspace/main.js'],
  })
}

describe('strong sandbox dependency mount', () => {
  it('mounts only the server-scoped layer as read-only and preserves network none', async () => {
    const plan = await runWithSandboxDependencyLayer(LAYER, async () => buildPlan())
    const create = plan.commands.create
    const dependencyMounts = create.filter((part) => part.includes('dst=/workspace/node_modules'))

    expect(create).toEqual(expect.arrayContaining(['--network', 'none', '--mount']))
    expect(dependencyMounts).toEqual([
      'type=bind,src=/tmp/symbolwright-dependency-layers/npm-layer-1/node_modules,dst=/workspace/node_modules,readonly',
    ])
    expect(create.join(' ')).not.toContain('--network host')
    expect(dependencyMounts.join(' ')).not.toContain('readonly=false')
    expect(dependencyMounts.join(' ')).not.toContain('dst=/workspace/node_modules,rw')
  })

  it('does not expose a caller-selectable dependency mount option', () => {
    expect(() =>
      buildSandboxContainerCommandPlan({
        image: { ...DEFAULT_SANDBOX_IMAGE_ALLOWLIST[0]!, enabled: true, installed: true },
        engine: {
          engine: 'docker',
          status: 'available',
          version: '27.0.0',
          reason: 'docker is available',
        },
        hostWorkspacePath: '/tmp/symbolwright-sandbox/input',
        hostOutputPath: '/tmp/symbolwright-sandbox/output',
        containerName: 'symbolwright-sandbox-dependency-test',
        entrypoint: ['node', '/workspace/main.js'],
        dependencyNodeModulesPath: '/tmp/attacker/node_modules',
      } as never),
    ).toThrow('Arbitrary container option is not allowed')
  })
})
