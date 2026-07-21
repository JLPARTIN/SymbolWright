import { describe, expect, it } from 'vitest'

import { inspectSandboxLocalImage } from './sandbox-image-store.js'
import type { SandboxContainerEngineStatus } from './sandbox-images.js'
import { DEFAULT_SANDBOX_IMAGE_ALLOWLIST } from './sandbox-images.js'
import type { SandboxImageStoreSpawnSync } from './sandbox-image-store.js'

const CHECKED_AT = '2026-07-21T00:00:00.000Z'
const IMAGE = DEFAULT_SANDBOX_IMAGE_ALLOWLIST[0]!
const DOCKER_ENGINE: SandboxContainerEngineStatus = {
  engine: 'docker',
  status: 'available',
  version: '27.0.0',
  reason: 'docker is detectable for read-only inspection.',
}

function fixedNow(): Date {
  return new Date(CHECKED_AT)
}

describe('sandbox image store inspection', () => {
  it('reads allowlisted local image metadata without running containers', async () => {
    const calls: Array<{ command: string; args: readonly string[] }> = []
    const spawnSync: SandboxImageStoreSpawnSync = (command, args, options) => {
      calls.push({ command, args })
      expect(options.shell).toBe(false)
      expect(options.timeout).toBe(1_000)
      expect(options.env['PATH']).toBe('/bin')
      return {
        status: 0,
        stdout: JSON.stringify([
          {
            Id: 'sha256:local-image-id',
            RepoDigests: ['node@sha256:allowlisted-digest'],
            Size: 123_456,
          },
        ]),
        stderr: '',
      }
    }

    const result = await inspectSandboxLocalImage(IMAGE, DOCKER_ENGINE, {
      env: { PATH: '/bin', GITHUB_TOKEN: 'must-not-pass' },
      now: fixedNow,
      spawnSync,
    })

    expect(calls).toEqual([{ command: 'docker', args: ['image', 'inspect', IMAGE.image] }])
    expect(result.status).toBe('installed')
    expect(result.sizeBytes).toBe(123_456)
    expect(result.digest).toBe('node@sha256:allowlisted-digest')
    expect(result.reason).toContain('local image store')
  })

  it('reports missing images without attempting preparation or execution', async () => {
    const spawnSync: SandboxImageStoreSpawnSync = (_command, args) => {
      expect(args).toEqual(['image', 'inspect', IMAGE.image])
      return {
        status: 1,
        stdout: '',
        stderr: 'image not found',
      }
    }

    const result = await inspectSandboxLocalImage(IMAGE, DOCKER_ENGINE, {
      now: fixedNow,
      spawnSync,
    })

    expect(result.status).toBe('missing')
    expect(result.reason).toContain('did not find')
    expect(result.reason).toContain('image not found')
  })

  it('does not call container tools when no engine is available', async () => {
    const result = await inspectSandboxLocalImage(
      IMAGE,
      {
        engine: 'none',
        status: 'unavailable',
        reason: 'No usable container engine is enabled.',
      },
      {
        now: fixedNow,
        spawnSync: () => {
          throw new Error('should not inspect without an engine')
        },
      },
    )

    expect(result.status).toBe('unavailable')
    expect(result.reason).toContain('No usable container engine')
  })
})
