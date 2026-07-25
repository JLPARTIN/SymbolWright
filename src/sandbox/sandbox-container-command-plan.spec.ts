import { describe, expect, it } from 'vitest'

import {
  assertContainerCommandPlanStaysNonExecutable,
  buildSandboxContainerCommandPlan,
} from './sandbox-container-command-plan.js'
import { DEFAULT_SANDBOX_IMAGE_ALLOWLIST } from './sandbox-images.js'
import type { SandboxContainerEngineStatus } from './sandbox-images.js'

const AVAILABLE_ENGINE: SandboxContainerEngineStatus = {
  engine: 'docker',
  status: 'available',
  version: '27.0.0',
  reason: 'docker is detectable for future capability evaluation.',
}

const IMAGE = DEFAULT_SANDBOX_IMAGE_ALLOWLIST[0]!

function planWith(overrides: Partial<Parameters<typeof buildSandboxContainerCommandPlan>[0]> = {}) {
  return buildSandboxContainerCommandPlan({
    image: IMAGE,
    engine: AVAILABLE_ENGINE,
    hostWorkspacePath: '/tmp/symbolwright-sandbox/workspace-1',
    entrypoint: ['node', '/workspace/main.js'],
    limits: {
      maxMemoryMb: 128,
      maxProcesses: 8,
      maxCpuPercent: 100,
    },
    ...overrides,
  })
}

describe('sandbox container command planner', () => {
  it('builds a review-only Docker argv with mandatory isolation controls', () => {
    const plan = planWith()
    const argv = plan.argv.join(' ')

    expect(plan.schemaVersion).toBe(1)
    expect(plan.executionEnabled).toBe(false)
    expect(assertContainerCommandPlanStaysNonExecutable(plan)).toBe(false)
    expect(plan.trustClass).toBe('container-isolated')
    expect(plan.backend).toBe('container')
    expect(plan.engine).toBe('docker')
    expect(plan.policy.executionEnabled).toBe(false)
    expect(plan.policy.networkPolicy).toBe('disabled')

    expect(plan.argv).toEqual(
      expect.arrayContaining([
        'docker',
        'run',
        '--rm',
        '--pull=never',
        '--network',
        'none',
        '--pid',
        'private',
        '--read-only',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--user',
        '65532:65532',
        '--memory',
        '128m',
        '--pids-limit',
        '8',
        '--workdir',
        '/workspace',
        '--env',
        'HOME=/tmp',
        'node:22-bookworm-slim',
        'node',
        '/workspace/main.js',
      ]),
    )
    expect(argv).not.toContain('--privileged')
    expect(argv).not.toContain('--network host')
    expect(argv).not.toContain('/var/run/docker.sock')
    expect(argv).not.toContain('/home/')
  })

  it('rejects arbitrary container flags and image names from request-shaped input', () => {
    expect(() =>
      buildSandboxContainerCommandPlan({
        image: IMAGE,
        engine: AVAILABLE_ENGINE,
        hostWorkspacePath: '/tmp/symbolwright-sandbox/workspace-1',
        entrypoint: ['node', '/workspace/main.js'],
        containerArgs: ['--privileged'],
      } as never),
    ).toThrow('Arbitrary container option is not allowed')

    expect(() =>
      buildSandboxContainerCommandPlan({
        image: IMAGE,
        engine: AVAILABLE_ENGINE,
        hostWorkspacePath: '/tmp/symbolwright-sandbox/workspace-1',
        entrypoint: ['node', '/workspace/main.js'],
        imageName: 'registry.example.invalid/anything:latest',
      } as never),
    ).toThrow('Arbitrary container option is not allowed')
  })

  it('rejects unsafe host workspace paths', () => {
    expect(() =>
      planWith({
        hostWorkspacePath: 'relative/workspace',
      }),
    ).toThrow('must be absolute')

    expect(() =>
      planWith({
        hostWorkspacePath: '/home/runner/workspace',
      }),
    ).toThrow('may not target host home')

    expect(() =>
      planWith({
        hostWorkspacePath: '/var/run/docker.sock',
      }),
    ).toThrow('may not target host home')
  })

  it('does not fall back to guarded-host when no container engine is available', () => {
    expect(() =>
      planWith({
        engine: {
          engine: 'none',
          status: 'unavailable',
          reason: 'No usable container engine is enabled.',
        },
      }),
    ).toThrow('available Docker or Podman engine')
  })
})
