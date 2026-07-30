import { describe, expect, it } from 'vitest'

import {
  buildSandboxContainerPolicyPlan,
  isSandboxContainerPolicyExecutable,
} from './sandbox-container-policy.js'
import { DEFAULT_SANDBOX_IMAGE_ALLOWLIST } from './sandbox-images.js'
import type { SandboxContainerEngineStatus } from './sandbox-images.js'
import { DEFAULT_SANDBOX_LIMITS, normalizeSandboxLimits } from './sandbox-limits.js'
import type { SandboxImageDefinition, SandboxLimits } from './sandbox-types.js'

const AVAILABLE_ENGINE: SandboxContainerEngineStatus = {
  engine: 'docker',
  status: 'available',
  version: '27.0.0',
  reason: 'docker is available',
}
const IMAGE = { ...DEFAULT_SANDBOX_IMAGE_ALLOWLIST[0]!, enabled: true, installed: true }

describe('sandbox limit normalization boundaries', () => {
  it('uses defaults for absent, non-finite, and non-positive values', () => {
    expect(normalizeSandboxLimits()).toEqual(DEFAULT_SANDBOX_LIMITS)
    expect(normalizeSandboxLimits(allLimits(Number.NaN))).toEqual(DEFAULT_SANDBOX_LIMITS)
    expect(normalizeSandboxLimits(allLimits(0))).toEqual(DEFAULT_SANDBOX_LIMITS)
  })

  it('floors tighter positive values and caps attempted relaxations', () => {
    const tighter = normalizeSandboxLimits(allLimits(3.9))
    expect(tighter).toEqual({
      timeoutMs: 3,
      compileTimeoutMs: 3,
      maxMemoryMb: 3,
      maxCpuPercent: 3,
      maxProcesses: 3,
      maxOutputBytes: 3,
      maxArtifactBytes: 3,
      maxFiles: 3,
      maxFileBytes: 3,
      maxTotalSourceBytes: 3,
      maxStdinBytes: 3,
      maxArgs: 3,
      maxArgBytes: 3,
    })

    expect(normalizeSandboxLimits(allLimits(Number.MAX_SAFE_INTEGER))).toEqual(
      DEFAULT_SANDBOX_LIMITS,
    )
  })

  it('falls back independently for invalid CPU limits', () => {
    expect(normalizeSandboxLimits({ maxCpuPercent: Number.NaN }).maxCpuPercent).toBe(
      DEFAULT_SANDBOX_LIMITS.maxCpuPercent,
    )
    expect(normalizeSandboxLimits({ maxCpuPercent: -1 }).maxCpuPercent).toBe(
      DEFAULT_SANDBOX_LIMITS.maxCpuPercent,
    )
  })
})

describe('sandbox container policy boundary coverage', () => {
  it('reports an executable verified policy plan', () => {
    const plan = buildSandboxContainerPolicyPlan({ image: IMAGE, engine: AVAILABLE_ENGINE })

    expect(plan.blockedReasons).toEqual([])
    expect(isSandboxContainerPolicyExecutable(plan)).toBe(true)
  })

  it('accumulates independent engine, image enablement, installation, and pinning failures', () => {
    const image: SandboxImageDefinition = {
      id: IMAGE.id,
      image: 'node:latest',
      languages: IMAGE.languages,
      source: IMAGE.source,
      enabled: false,
      installed: false,
    }
    const engine: SandboxContainerEngineStatus = {
      engine: 'docker',
      status: 'unavailable',
      reason: 'docker daemon unavailable',
    }

    const plan = buildSandboxContainerPolicyPlan({ image, engine })

    expect(plan.executionEnabled).toBe(false)
    expect(plan.digest).toBeUndefined()
    expect(plan.blockedReasons).toEqual([
      'docker daemon unavailable',
      'Sandbox image is not enabled by operator policy.',
      'Sandbox image is not verified as installed in the local engine image store.',
      'Sandbox image reference is not pinned to its allowlisted sha256 digest.',
    ])
    expect(isSandboxContainerPolicyExecutable(plan)).toBe(false)
  })

  it('rejects an available but unsupported engine kind and malformed or mismatched digests', () => {
    const unsupportedEngine: SandboxContainerEngineStatus = {
      engine: 'none',
      status: 'available',
      reason: 'unsupported engine',
    }
    const malformedDigest = buildSandboxContainerPolicyPlan({
      image: {
        ...IMAGE,
        digest: 'sha256:not-a-digest',
        image: 'node:26-alpine@sha256:not-a-digest',
      },
      engine: unsupportedEngine,
    })
    expect(malformedDigest.blockedReasons).toEqual([
      'unsupported engine',
      'Sandbox image reference is not pinned to its allowlisted sha256 digest.',
    ])

    const mismatchedDigest = buildSandboxContainerPolicyPlan({
      image: { ...IMAGE, image: `node:26-alpine@sha256:${'f'.repeat(64)}` },
      engine: AVAILABLE_ENGINE,
    })
    expect(mismatchedDigest.blockedReasons).toEqual([
      'Sandbox image reference is not pinned to its allowlisted sha256 digest.',
    ])
  })

  it('short-circuits a nominally enabled policy that still has a blocked reason', () => {
    expect(
      isSandboxContainerPolicyExecutable({
        ...buildSandboxContainerPolicyPlan({ image: IMAGE, engine: AVAILABLE_ENGINE }),
        executionEnabled: true,
        blockedReasons: ['synthetic blocked reason'],
      }),
    ).toBe(false)
  })
})

function allLimits(value: number): Partial<SandboxLimits> {
  return {
    timeoutMs: value,
    compileTimeoutMs: value,
    maxMemoryMb: value,
    maxCpuPercent: value,
    maxProcesses: value,
    maxOutputBytes: value,
    maxArtifactBytes: value,
    maxFiles: value,
    maxFileBytes: value,
    maxTotalSourceBytes: value,
    maxStdinBytes: value,
    maxArgs: value,
    maxArgBytes: value,
  }
}
