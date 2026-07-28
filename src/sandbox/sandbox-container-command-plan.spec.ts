import { describe, expect, it } from 'vitest'

import {
  buildSandboxContainerCommandPlan,
  isSandboxContainerCommandPlanExecutable,
} from './sandbox-container-command-plan.js'
import { DEFAULT_SANDBOX_IMAGE_ALLOWLIST } from './sandbox-images.js'
import type { SandboxContainerEngineStatus } from './sandbox-images.js'

const AVAILABLE_ENGINE: SandboxContainerEngineStatus = {
  engine: 'docker',
  status: 'available',
  version: '27.0.0',
  reason: 'docker is available.',
}

const IMAGE = { ...DEFAULT_SANDBOX_IMAGE_ALLOWLIST[0]!, enabled: true, installed: true }

function planWith(overrides: Partial<Parameters<typeof buildSandboxContainerCommandPlan>[0]> = {}) {
  return buildSandboxContainerCommandPlan({
    image: IMAGE,
    engine: AVAILABLE_ENGINE,
    hostWorkspacePath: '/tmp/symbolwright-sandbox/workspace-1/input',
    hostOutputPath: '/tmp/symbolwright-sandbox/workspace-1/output',
    containerName: 'symbolwright-sandbox-test-1',
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
  it('builds executable create/stream/exec phases with mandatory isolation controls', () => {
    const plan = planWith()
    const create = plan.commands.create.join(' ')
    const copyIn = plan.commands.copyIn.join(' ')
    const allCommands = Object.values(plan.commands).flat().join(' ')

    expect(plan.schemaVersion).toBe(2)
    expect(plan.executionEnabled).toBe(true)
    expect(isSandboxContainerCommandPlanExecutable(plan)).toBe(true)
    expect(plan.trustClass).toBe('container-isolated')
    expect(plan.backend).toBe('container')
    expect(plan.engine).toBe('docker')
    expect(plan.policy.executionEnabled).toBe(true)
    expect(plan.policy.networkPolicy).toBe('disabled')
    expect(plan.image).toContain('@sha256:')

    expect(plan.commands.create).toEqual(
      expect.arrayContaining([
        'docker',
        'create',
        '--pull=never',
        '--network',
        'none',
        '--ipc',
        'none',
        '--read-only',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges:true',
        '--user',
        '65532:65532',
        '--memory',
        '128m',
        '--memory-swap',
        '128m',
        '--pids-limit',
        '8',
        '--workdir',
        '/workspace',
        '--env',
        'HOME=/tmp',
      ]),
    )
    expect(create).toContain('/workspace:rw,nosuid,nodev,size=')
    expect(create).not.toContain('--pid host')
    expect(create).not.toContain('--pid container:')
    expect(copyIn).toContain('docker exec -i')
    expect(copyIn).toContain('--user 65532:65532')
    expect(copyIn).toContain('node -e')
    expect(plan.commands.copyOut.join(' ')).toContain('docker exec')
    expect(plan.commands.copyOut.join(' ')).toContain('SYMBOLWRIGHT_COPY_OUT_MAX_FILES=')
    expect(plan.commands.copyOut.join(' ')).toContain('node -e')
    expect(plan.commands.execute).toContain('exec')
    expect(allCommands).not.toContain('--privileged')
    expect(allCommands).not.toContain('--network host')
    expect(allCommands).not.toContain('/var/run/docker.sock')
    expect(allCommands).not.toContain('/home/')
    expect(allCommands).not.toContain('type=bind')
  })

  it('rejects arbitrary container flags and image names from request-shaped input', () => {
    expect(() =>
      buildSandboxContainerCommandPlan({
        image: IMAGE,
        engine: AVAILABLE_ENGINE,
        hostWorkspacePath: '/tmp/symbolwright-sandbox/workspace-1/input',
        hostOutputPath: '/tmp/symbolwright-sandbox/workspace-1/output',
        containerName: 'symbolwright-sandbox-test-1',
        entrypoint: ['node', '/workspace/main.js'],
        containerArgs: ['--privileged'],
      } as never),
    ).toThrow('Arbitrary container option is not allowed')

    expect(() =>
      buildSandboxContainerCommandPlan({
        image: IMAGE,
        engine: AVAILABLE_ENGINE,
        hostWorkspacePath: '/tmp/symbolwright-sandbox/workspace-1/input',
        hostOutputPath: '/tmp/symbolwright-sandbox/workspace-1/output',
        containerName: 'symbolwright-sandbox-test-1',
        entrypoint: ['node', '/workspace/main.js'],
        imageName: 'registry.example.invalid/anything:latest',
      } as never),
    ).toThrow('Arbitrary container option is not allowed')
  })

  it('rejects unsafe host paths, root users, and mutable images', () => {
    expect(() => planWith({ hostWorkspacePath: 'relative/workspace' })).toThrow('must be absolute')
    expect(() => planWith({ hostWorkspacePath: '/home/runner/workspace' })).toThrow(
      'may not target host home',
    )
    expect(() => planWith({ hostWorkspacePath: '/var/run/docker.sock' })).toThrow(
      'may not target host home',
    )
    expect(() => planWith({ user: '0:0' })).toThrow('numeric non-root')
    expect(() =>
      planWith({
        image: {
          id: IMAGE.id,
          image: 'node:latest',
          languages: IMAGE.languages,
          source: IMAGE.source,
          enabled: true,
          installed: true,
        },
      }),
    ).toThrow('digest-pinned')
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
