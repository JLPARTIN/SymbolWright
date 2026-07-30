import { describe, expect, it } from 'vitest'

import {
  buildSandboxContainerCommandPlan,
  isSandboxContainerCommandPlanExecutable,
} from './sandbox-container-command-plan.js'
import type { SandboxContainerCommandPlan } from './sandbox-container-command-plan.js'
import {
  currentSandboxDependencyLayer,
  runWithSandboxDependencyLayer,
} from './sandbox-dependency-execution-context.js'
import { DEFAULT_SANDBOX_IMAGE_ALLOWLIST } from './sandbox-images.js'
import type { StrongSandboxDependencyLayer } from './npm-dependency-layer.js'

const LAYER: StrongSandboxDependencyLayer = {
  schemaVersion: 1,
  layerId: 'execution-boundary-layer',
  ecosystem: 'npm',
  rootPath: '/tmp/symbolwright-dependency-layers/execution-boundary-layer',
  nodeModulesPath: '/tmp/symbolwright-dependency-layers/execution-boundary-layer/node_modules',
  manifestPath: '/tmp/symbolwright-dependency-layers/execution-boundary-layer/manifest.json',
  sbomPath: '/tmp/symbolwright-dependency-layers/execution-boundary-layer/sbom.cdx.json',
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

describe('sandbox dependency execution context boundaries', () => {
  it('executes directly without inventing a dependency context', async () => {
    expect(currentSandboxDependencyLayer()).toBeUndefined()

    await expect(
      runWithSandboxDependencyLayer(undefined, async () => {
        expect(currentSandboxDependencyLayer()).toBeUndefined()
        return 'offline'
      }),
    ).resolves.toBe('offline')

    expect(currentSandboxDependencyLayer()).toBeUndefined()
  })

  it('scopes nested dependency layers and restores the outer context', async () => {
    const nestedLayer = {
      ...LAYER,
      layerId: 'nested-layer',
      nodeModulesPath: '/tmp/symbolwright-dependency-layers/nested-layer/node_modules',
    }

    await runWithSandboxDependencyLayer(LAYER, async () => {
      expect(currentSandboxDependencyLayer()).toBe(LAYER)
      await runWithSandboxDependencyLayer(nestedLayer, async () => {
        expect(currentSandboxDependencyLayer()).toBe(nestedLayer)
      })
      expect(currentSandboxDependencyLayer()).toBe(LAYER)
    })

    expect(currentSandboxDependencyLayer()).toBeUndefined()
  })

  it.each([
    ['relative/node_modules', 'Dependency layer path must be absolute.'],
    ['/tmp/dependency,node_modules', 'Dependency layer path contains a forbidden mount character.'],
    ['/', 'Dependency layer path may not be the filesystem root.'],
  ])('rejects unsafe dependency mount path %s', async (nodeModulesPath, message) => {
    await expect(
      runWithSandboxDependencyLayer({ ...LAYER, nodeModulesPath }, async () => buildPlan()),
    ).rejects.toThrow(message)
  })

  it('reports executable and both short-circuited blocked plan states', () => {
    const executable = buildPlan()
    expect(isSandboxContainerCommandPlanExecutable(executable)).toBe(true)

    expect(
      isSandboxContainerCommandPlanExecutable({
        executionEnabled: false,
        policy: { executionEnabled: true },
      } as unknown as SandboxContainerCommandPlan),
    ).toBe(false)
    expect(
      isSandboxContainerCommandPlanExecutable({
        executionEnabled: true,
        policy: { executionEnabled: false },
      } as unknown as SandboxContainerCommandPlan),
    ).toBe(false)
  })
})

function buildPlan(): SandboxContainerCommandPlan {
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
    containerName: 'symbolwright-sandbox-execution-boundary',
    entrypoint: ['node', '/workspace/main.js'],
  })
}
