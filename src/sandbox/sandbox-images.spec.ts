import { describe, expect, it } from 'vitest'

import {
  buildSandboxImagePolicy,
  DEFAULT_SANDBOX_IMAGE_ALLOWLIST,
  findSandboxImage,
  isAllowedSandboxImageId,
  selectContainerEngine,
  STRONG_SANDBOX_NODE_IMAGE,
  STRONG_SANDBOX_NODE_IMAGE_ID,
} from './sandbox-images.js'
import { runnerAvailability } from './sandbox-registry.js'

const CHECKED_AT = '2026-07-20T00:00:00.000Z'

describe('sandbox container image policy', () => {
  it('defines one explicit disabled digest-pinned image and rejects arbitrary image ids', () => {
    const policy = buildSandboxImagePolicy(new Map(), {})

    expect(policy.images).toHaveLength(1)
    expect(policy.images.every((image) => image.enabled === false)).toBe(true)
    expect(policy.images.every((image) => image.installed === false)).toBe(true)
    expect(policy.images.map((image) => image.id)).toContain(STRONG_SANDBOX_NODE_IMAGE_ID)
    expect(isAllowedSandboxImageId(policy.images, STRONG_SANDBOX_NODE_IMAGE_ID)).toBe(true)
    expect(isAllowedSandboxImageId(policy.images, 'evil/random:latest')).toBe(false)
    expect(findSandboxImage(policy.images, STRONG_SANDBOX_NODE_IMAGE_ID)?.image).toBe(
      STRONG_SANDBOX_NODE_IMAGE,
    )
    expect(DEFAULT_SANDBOX_IMAGE_ALLOWLIST.some((image) => image.image.endsWith(':latest'))).toBe(
      false,
    )
    expect(policy.images[0]?.digest).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('reports a detected engine without enabling execution until operator opt-in', () => {
    const availability = new Map([
      [
        'docker',
        runnerAvailability('available', CHECKED_AT, {
          version: '27.0.0',
        }),
      ],
    ])
    const disabled = buildSandboxImagePolicy(availability, {})

    expect(disabled.engine.engine).toBe('docker')
    expect(disabled.engine.status).toBe('available')
    expect(disabled.engine.version).toBe('27.0.0')
    expect(disabled.warnings.join('\n')).toContain('never downloads an image')
    expect(disabled.images.every((image) => image.enabled === false)).toBe(true)

    const enabled = buildSandboxImagePolicy(availability, {
      SYMBOLWRIGHT_ENABLE_STRONG_CONTAINER_EXECUTION: 'true',
    })
    expect(enabled.images.every((image) => image.enabled === true)).toBe(true)
    expect(enabled.warnings.join('\n')).toContain('exact image digest is verified')
  })

  it('falls back to unavailable or misconfigured when engines cannot be used', () => {
    const unavailable = selectContainerEngine(new Map())
    expect(unavailable.engine).toBe('none')
    expect(unavailable.status).toBe('unavailable')

    const misconfigured = selectContainerEngine(
      new Map([
        [
          'docker',
          runnerAvailability('misconfigured', CHECKED_AT, {
            reason: 'docker exited with status 1',
          }),
        ],
      ]),
    )
    expect(misconfigured.engine).toBe('none')
    expect(misconfigured.status).toBe('misconfigured')
    expect(misconfigured.reason).toContain('docker exited with status 1')
  })
})
