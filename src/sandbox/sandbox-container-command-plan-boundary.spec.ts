import { describe, expect, it } from 'vitest'

import { buildSandboxContainerCommandPlan } from './sandbox-container-command-plan.js'
import { DEFAULT_SANDBOX_IMAGE_ALLOWLIST } from './sandbox-images.js'
import type { SandboxContainerEngineStatus } from './sandbox-images.js'
import type { SandboxImageDefinition } from './sandbox-types.js'

const AVAILABLE_DOCKER: SandboxContainerEngineStatus = {
  engine: 'docker',
  status: 'available',
  version: '27.0.0',
  reason: 'docker is available',
}
const IMAGE = { ...DEFAULT_SANDBOX_IMAGE_ALLOWLIST[0]!, enabled: true, installed: true }

describe('sandbox container command plan fail-closed boundaries', () => {
  it('supports an available Podman engine and an explicit numeric non-root user', () => {
    const plan = buildPlan({
      engine: {
        engine: 'podman',
        status: 'available',
        version: '5.0.0',
        reason: 'podman is available',
      },
      user: '1000:1001',
    })

    expect(plan.engine).toBe('podman')
    expect(plan.commands.create).toEqual(expect.arrayContaining(['--user', '1000:1001']))
  })

  it('rejects a known container engine that is not available', () => {
    expect(() =>
      buildPlan({
        engine: {
          engine: 'docker',
          status: 'unavailable',
          reason: 'docker daemon is unavailable',
        },
      }),
    ).toThrow('Container command plans require an available Docker or Podman engine.')
  })

  it.each([
    [
      'an invalid digest',
      {
        ...IMAGE,
        digest: 'sha256:not-a-digest',
        image: 'node:26-alpine@sha256:not-a-digest',
      },
    ],
    [
      'a mismatched image reference',
      {
        ...IMAGE,
        image: 'node:26-alpine@sha256:' + 'f'.repeat(64),
      },
    ],
  ])('rejects %s', (_label, image) => {
    expect(() => buildPlan({ image })).toThrow(
      'Container execution requires an allowlisted digest-pinned image reference.',
    )
  })

  it('rejects an otherwise pinned image disabled by operator policy', () => {
    expect(() => buildPlan({ image: { ...IMAGE, enabled: false } })).toThrow(
      'Sandbox image is not enabled by operator policy.',
    )
  })

  it.each([
    ['/tmp/workspace\0escape', 'Container host path may not contain null bytes.'],
    ['/', 'Container host path may not be the filesystem root.'],
    ['/tmp/project/.git/objects', 'Container host path may not target host home, Git, or engine socket paths.'],
    ['/root/project', 'Container host path may not target host home, Git, or engine socket paths.'],
    ['/run/podman/podman.sock', 'Container host path may not target host home, Git, or engine socket paths.'],
  ])('rejects unsafe host workspace path %s', (hostWorkspacePath, message) => {
    expect(() => buildPlan({ hostWorkspacePath })).toThrow(message)
  })

  it('rejects empty and unsafe entrypoint arguments', () => {
    expect(() => buildPlan({ entrypoint: [] })).toThrow(
      'Container command plan requires an entrypoint.',
    )
    expect(() => buildPlan({ entrypoint: ['node', ''] })).toThrow(
      'Container entrypoint arguments must be non-empty and null-byte free.',
    )
    expect(() => buildPlan({ entrypoint: ['node', 'main.js\0escape'] })).toThrow(
      'Container entrypoint arguments must be non-empty and null-byte free.',
    )
  })

  it.each(['sandbox-test', 'symbolwright-sandbox-', 'symbolwright-sandbox-UPPER']) (
    'rejects invalid managed container name %s',
    (containerName) => {
      expect(() => buildPlan({ containerName })).toThrow(
        'Container name is not a valid SymbolWright-managed sandbox name.',
      )
    },
  )

  it.each(['root', '0:1000', '1000:0', '1000'])('rejects unsafe container user %s', (user) => {
    expect(() => buildPlan({ user })).toThrow(
      'Container execution requires a numeric non-root uid:gid pair.',
    )
  })
})

function buildPlan(
  overrides: Partial<{
    readonly image: SandboxImageDefinition
    readonly engine: SandboxContainerEngineStatus
    readonly hostWorkspacePath: string
    readonly hostOutputPath: string
    readonly containerName: string
    readonly entrypoint: readonly string[]
    readonly user: string
  }> = {},
) {
  return buildSandboxContainerCommandPlan({
    image: IMAGE,
    engine: AVAILABLE_DOCKER,
    hostWorkspacePath: '/tmp/symbolwright-sandbox/input',
    hostOutputPath: '/tmp/symbolwright-sandbox/output',
    containerName: 'symbolwright-sandbox-boundary-test',
    entrypoint: ['node', '/workspace/main.js'],
    ...overrides,
  })
}
