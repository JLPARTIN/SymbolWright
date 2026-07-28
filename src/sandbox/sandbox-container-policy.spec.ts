import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SANDBOX_CONTAINER_CONTROLS,
  buildSandboxContainerPolicyPlan,
  isSandboxContainerPolicyExecutable,
} from './sandbox-container-policy.js'
import { DEFAULT_SANDBOX_IMAGE_ALLOWLIST } from './sandbox-images.js'
import type { SandboxContainerEngineStatus } from './sandbox-images.js'

const IMAGE = { ...DEFAULT_SANDBOX_IMAGE_ALLOWLIST[0]!, enabled: true, installed: true }
const AVAILABLE_ENGINE: SandboxContainerEngineStatus = {
  engine: 'docker',
  status: 'available',
  version: '27.0.0',
  reason: 'docker is available for strong sandbox execution.',
}

describe('sandbox container policy', () => {
  it('defines every mandatory isolation control', () => {
    const controls = DEFAULT_SANDBOX_CONTAINER_CONTROLS

    expect(controls.networkPolicy).toBe('disabled')
    expect(controls.privileged).toBe(false)
    expect(controls.hostPid).toBe(false)
    expect(controls.hostNetwork).toBe(false)
    expect(controls.socketMounts).toBe(false)
    expect(controls.homeMounts).toBe(false)
    expect(controls.repositoryMounts).toBe(false)
    expect(controls.arbitraryMounts).toBe(false)
    expect(controls.arbitraryContainerArgs).toBe(false)
    expect(controls.registryCredentials).toBe(false)
    expect(controls.rootUser).toBe(false)
    expect(controls.privilegeEscalation).toBe(false)
    expect(controls.droppedCapabilities).toBe(true)
    expect(controls.nonRootUser).toBe(true)
    expect(controls.readOnlyRootFilesystem).toBe(true)
    expect(controls.privatePidNamespace).toBe(true)
    expect(controls.privateIpcNamespace).toBe(true)
    expect(controls.temporaryWorkspaceOnly).toBe(true)
    expect(controls.tmpfsWorkspaceQuota).toBe(true)
    expect(controls.digestPinnedImage).toBe(true)
    expect(controls.pullNever).toBe(true)
    expect(controls.cleanupRequired).toBe(true)
    expect(controls.orphanReapingRequired).toBe(true)
    expect(controls.minimalEnvironment).toBe(true)
    expect(controls.resourceLimitsRequired).toBe(true)
  })

  it('builds an executable plan only when engine, opt-in, installation, and digest controls hold', () => {
    const plan = buildSandboxContainerPolicyPlan({
      image: IMAGE,
      engine: AVAILABLE_ENGINE,
      limits: {
        timeoutMs: 2_000,
        maxMemoryMb: 128,
      },
    })

    expect(plan.schemaVersion).toBe(2)
    expect(plan.trustClass).toBe('container-isolated')
    expect(plan.backend).toBe('container')
    expect(plan.executionEnabled).toBe(true)
    expect(plan.networkPolicy).toBe('disabled')
    expect(plan.imageId).toBe(IMAGE.id)
    expect(plan.digest).toBe(IMAGE.digest)
    expect(plan.limits.timeoutMs).toBe(2_000)
    expect(plan.limits.maxMemoryMb).toBe(128)
    expect(plan.blockedReasons).toEqual([])
    expect(plan.warnings.join('\n')).toContain('--pull=never')
    expect(plan.warnings.join('\n')).toContain('quarantine')
    expect(isSandboxContainerPolicyExecutable(plan)).toBe(true)
  })

  it('fails closed for disabled, uninstalled, mutable, or unavailable configurations', () => {
    const disabled = buildSandboxContainerPolicyPlan({
      image: { ...IMAGE, enabled: false },
      engine: AVAILABLE_ENGINE,
    })
    expect(disabled.executionEnabled).toBe(false)
    expect(disabled.blockedReasons).toContain('Sandbox image is not enabled by operator policy.')

    const missing = buildSandboxContainerPolicyPlan({
      image: { ...IMAGE, installed: false },
      engine: AVAILABLE_ENGINE,
    })
    expect(missing.executionEnabled).toBe(false)
    expect(missing.blockedReasons).toContain(
      'Sandbox image is not verified as installed in the local engine image store.',
    )

    const mutable = buildSandboxContainerPolicyPlan({
      image: {
        id: IMAGE.id,
        image: 'node:latest',
        languages: IMAGE.languages,
        source: IMAGE.source,
        enabled: true,
        installed: true,
      },
      engine: AVAILABLE_ENGINE,
    })
    expect(mutable.executionEnabled).toBe(false)
    expect(mutable.blockedReasons).toContain(
      'Sandbox image reference is not pinned to its allowlisted sha256 digest.',
    )

    const unavailable = buildSandboxContainerPolicyPlan({
      image: IMAGE,
      engine: {
        engine: 'none',
        status: 'unavailable',
        reason: 'No usable container engine is enabled.',
      },
    })
    expect(unavailable.executionEnabled).toBe(false)
    expect(unavailable.blockedReasons).toContain('No usable container engine is enabled.')
    expect(unavailable.blockedReasons).not.toContain('Use guarded-host fallback')
  })
})
