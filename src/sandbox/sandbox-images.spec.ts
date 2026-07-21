import { describe, expect, it } from 'vitest'

import {
  buildSandboxImagePolicy,
  DEFAULT_SANDBOX_IMAGE_ALLOWLIST,
  findSandboxImage,
  isAllowedSandboxImageId,
  selectContainerEngine,
} from './sandbox-images.js'
import { runnerAvailability } from './sandbox-registry.js'

const CHECKED_AT = '2026-07-20T00:00:00.000Z'

describe('sandbox container image policy', () => {
  it('defines an explicit disabled image allowlist and rejects arbitrary image ids', () => {
    const policy = buildSandboxImagePolicy()

    expect(policy.images.length).toBeGreaterThan(0)
    expect(policy.images.every((image) => image.enabled === false)).toBe(true)
    expect(policy.images.every((image) => image.installed === false)).toBe(true)
    expect(policy.images.map((image) => image.id)).toContain('python-3-12-slim')
    expect(isAllowedSandboxImageId(policy.images, 'python-3-12-slim')).toBe(true)
    expect(isAllowedSandboxImageId(policy.images, 'evil/random:latest')).toBe(false)
    expect(findSandboxImage(policy.images, 'python-3-12-slim')?.image).toBe('python:3.12-slim')
    expect(DEFAULT_SANDBOX_IMAGE_ALLOWLIST.some((image) => image.image.endsWith(':latest'))).toBe(
      false,
    )
  })

  it('reports detected container engines without enabling execution', () => {
    const policy = buildSandboxImagePolicy(
      new Map([
        [
          'docker',
          runnerAvailability('available', CHECKED_AT, {
            version: '27.0.0',
          }),
        ],
      ]),
    )

    expect(policy.engine.engine).toBe('docker')
    expect(policy.engine.status).toBe('available')
    expect(policy.engine.version).toBe('27.0.0')
    expect(policy.warnings.join('\n')).toContain('does not execute containers')
    expect(policy.images.every((image) => image.enabled === false)).toBe(true)
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
