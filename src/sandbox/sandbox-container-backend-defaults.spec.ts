import { describe, expect, it } from 'vitest'

import { executeStrongSandboxContainer } from './sandbox-container-backend.js'
import { runnerAvailability, buildSandboxInventory } from './sandbox-registry.js'

const CHECKED_AT = '2026-07-28T00:00:00.000Z'

describe('strong sandbox backend defaults', () => {
  it('fails closed with process defaults when optional execution context is omitted', async () => {
    const inventory = buildSandboxInventory({
      env: { SYMBOLWRIGHT_ENABLE_STRONG_CONTAINER_EXECUTION: 'true' },
      commandAvailability: new Map([
        ['docker', runnerAvailability('available', CHECKED_AT, { version: 'test' })],
      ]),
    })
    const runner = inventory.runners.find((candidate) => candidate.backend === 'container')
    const image = inventory.images.find((candidate) => candidate.id === runner?.container?.imageId)
    if (runner === undefined || image === undefined) throw new Error('Container fixture unavailable')

    const result = await executeStrongSandboxContainer({
      executionId: 'backend-defaults',
      request: {
        languageId: 'javascript',
        mode: 'run',
        source: "console.log('must not run')",
      },
      runner: {
        ...runner,
        backend: 'browser',
        trustClass: 'browser-isolated',
      },
      image,
      engine: {
        engine: 'docker',
        status: 'available',
        version: 'test',
        reason: 'test engine',
      },
      startedAt: CHECKED_AT,
      now: () => new Date(CHECKED_AT),
    })

    expect(result.status).toBe('internal-error')
    expect(result.cleanup).toEqual({ attempted: true, succeeded: true })
    expect(result.stderr).toContain('container-isolated runner')
  })
})
