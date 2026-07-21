import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SANDBOX_CONTAINER_CONTROLS,
  buildSandboxContainerPolicyPlan,
  isSandboxContainerPolicyExecutable,
} from './sandbox-container-policy.js'
import { DEFAULT_SANDBOX_IMAGE_ALLOWLIST } from './sandbox-images.js'
import type { SandboxContainerEngineStatus } from './sandbox-images.js'

const IMAGE = DEFAULT_SANDBOX_IMAGE_ALLOWLIST[0]!
const AVAILABLE_ENGINE: SandboxContainerEngineStatus = {
  engine: 'docker',
  status: 'available',
  version: '27.0.0',
  reason: 'docker is detectable for future capability evaluation.',
}

describe('sandbox container policy skeleton', () => {
  it('defines mandatory isolation controls without enabling execution', () => {
    const controls = DEFAULT_SANDBOX_CONTAINER_CONTROLS

    expect(controls.networkPolicy).toBe('disabled')
    expect(controls.privileged).toBe(false)
    expect(controls.hostPid).toBe(false)
    expect(controls.hostNetwork).toBe(false)
    expect(controls.socketMounts).toBe(false)
    expect(controls.homeMounts).toBe(false)
    expect(controls.arbitraryMounts).toBe(false)
    expect(controls.arbitraryContainerArgs).toBe(false)
    expect(controls.registryCredentials).toBe(false)
    expect(controls.rootUser).toBe(false)
    expect(controls.privilegeEscalation).toBe(false)
    expect(controls.droppedCapabilities).toBe(true)
    expect(controls.nonRootUser).toBe(true)
    expect(controls.readOnlyRootFilesystem).toBe(true)
    expect(controls.temporaryWorkspaceOnly).toBe(true)
    expect(controls.cleanupRequired).toBe(true)
    expect(controls.minimalEnvironment).toBe(true)
    expect(controls.resourceLimitsRequired).toBe(true)
  })

  it('builds a blocked plan for allowlisted images until a backend enforces the policy', () => {
    const plan = buildSandboxContainerPolicyPlan({
      image: IMAGE,
      engine: AVAILABLE_ENGINE,
      limits: {
        timeoutMs: 2_000,
        maxMemoryMb: 128,
      },
    })

    expect(plan.schemaVersion).toBe(1)
    expect(plan.trustClass).toBe('container-isolated')
    expect(plan.backend).toBe('container')
    expect(plan.executionEnabled).toBe(false)
    expect(plan.networkPolicy).toBe('disabled')
    expect(plan.imageId).toBe(IMAGE.id)
    expect(plan.limits.timeoutMs).toBe(2_000)
    expect(plan.limits.maxMemoryMb).toBe(128)
    expect(plan.blockedReasons).toContain('Sandbox image is allowlisted but not enabled for execution.')
    expect(plan.blockedReasons).toContain(
      'Sandbox image is not confirmed installed by read-only local inspection.',
    )
    expect(plan.blockedReasons).toContain(
      'Container execution remains disabled until the backend runner enforces this policy.',
    )
    expect(plan.warnings.join('\n')).toContain('not a container execution backend')
    expect(isSandboxContainerPolicyExecutable(plan)).toBe(false)
  })

  it('preserves unavailable engine reasons without trying a fallback backend', () => {
    const plan = buildSandboxContainerPolicyPlan({
      image: IMAGE,
      engine: {
        engine: 'none',
        status: 'unavailable',
        reason: 'No usable container engine is enabled.',
      },
    })

    expect(plan.executionEnabled).toBe(false)
    expect(plan.blockedReasons).toContain('No usable container engine is enabled.')
    expect(plan.blockedReasons).not.toContain('Use guarded-host fallback')
  })
})
