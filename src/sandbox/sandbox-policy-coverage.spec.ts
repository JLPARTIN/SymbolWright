import { describe, expect, it } from 'vitest'

import { DEFAULT_SANDBOX_LIMITS } from './sandbox-limits.js'
import { evaluateSandboxPolicy } from './sandbox-policy.js'
import { SandboxService } from './sandbox-service.js'
import type {
  SandboxExecutionRequest,
  SandboxInventory,
  SandboxRunnerDefinition,
} from './sandbox-types.js'

const CHECKED_AT = '2026-07-21T00:00:00.000Z'

function runner(
  overrides: Partial<SandboxRunnerDefinition> = {},
): SandboxRunnerDefinition {
  return {
    id: 'coverage-runner',
    languageIds: ['javascript'],
    displayName: 'Coverage Runner',
    trustClass: 'browser-isolated',
    backend: 'browser',
    availability: {
      status: 'available',
      checkedAt: CHECKED_AT,
    },
    capabilities: {
      run: true,
      compile: true,
      test: true,
      stdin: true,
      multiFile: true,
      repository: true,
      network: false,
    },
    limits: DEFAULT_SANDBOX_LIMITS,
    networkPolicy: 'disabled',
    dependencyState: 'ready',
    notes: [],
    ...overrides,
  }
}

function request(
  overrides: Partial<SandboxExecutionRequest> = {},
): SandboxExecutionRequest {
  return {
    languageId: 'javascript',
    mode: 'run',
    source: 'console.log("coverage")',
    ...overrides,
  }
}

function inventory(runners: readonly SandboxRunnerDefinition[]): SandboxInventory {
  return {
    schemaVersion: 1,
    generatedAt: CHECKED_AT,
    runners,
    images: [],
    warnings: [],
  }
}

describe('sandbox policy branch coverage', () => {
  it('reports unavailable runners with explicit and fallback reasons', () => {
    const explicit = evaluateSandboxPolicy(
      request(),
      runner({
        availability: {
          status: 'unavailable',
          checkedAt: CHECKED_AT,
          reason: 'runtime probe failed',
        },
      }),
      { mode: 'APPROVED_EXECUTION', env: {} },
    )
    expect(explicit).toEqual({ allowed: false, reason: 'runtime probe failed' })

    const fallback = evaluateSandboxPolicy(
      request(),
      runner({
        availability: {
          status: 'misconfigured',
          checkedAt: CHECKED_AT,
        },
      }),
      { mode: 'APPROVED_EXECUTION', env: {} },
    )
    expect(fallback.allowed).toBe(false)
    expect(fallback.reason).toContain('coverage-runner is unavailable')
  })

  it('rejects unsupported run, compile, test, and repository modes', () => {
    const noCapabilities = {
      run: false,
      compile: false,
      test: false,
      stdin: true,
      multiFile: true,
      repository: false,
      network: false,
    }

    expect(
      evaluateSandboxPolicy(request(), runner({ capabilities: noCapabilities }), {
        mode: 'APPROVED_EXECUTION',
        env: {},
      }).reason,
    ).toContain('does not support run mode')

    expect(
      evaluateSandboxPolicy(
        request({ mode: 'compile' }),
        runner({ capabilities: noCapabilities }),
        { mode: 'APPROVED_EXECUTION', env: {} },
      ).reason,
    ).toContain('does not support compile mode')

    expect(
      evaluateSandboxPolicy(
        request({ mode: 'test' }),
        runner({ capabilities: noCapabilities }),
        { mode: 'APPROVED_EXECUTION', env: {} },
      ).reason,
    ).toContain('does not support test mode')

    expect(
      evaluateSandboxPolicy(
        request({ repository: { rootPath: '/tmp/repository' }, source: undefined }),
        runner({ capabilities: noCapabilities }),
        { mode: 'APPROVED_EXECUTION', env: {} },
      ).reason,
    ).toContain('does not support repository execution')
  })

  it('blocks every non-execution runtime mode', () => {
    const candidate = runner()

    expect(
      evaluateSandboxPolicy(request(), candidate, { mode: 'READ_ONLY', env: {} }).reason,
    ).toContain('READ_ONLY')
    expect(
      evaluateSandboxPolicy(request(), candidate, { mode: 'PROPOSAL_ONLY', env: {} }).reason,
    ).toContain('PROPOSAL_ONLY')
    expect(
      evaluateSandboxPolicy(request(), candidate, { mode: 'PLAN_ONLY', env: {} }).reason,
    ).toContain('PLAN_ONLY')
  })

  it('covers guarded-host, unavailable, and generic trust decisions', () => {
    const guarded = runner({
      trustClass: 'guarded-host',
      backend: 'guarded-host',
    })
    expect(
      evaluateSandboxPolicy(request(), guarded, {
        mode: 'APPROVED_EXECUTION',
        env: {},
      }).allowed,
    ).toBe(false)
    expect(
      evaluateSandboxPolicy(request(), guarded, {
        mode: 'APPROVED_EXECUTION',
        env: { CODEMIND_ALLOW_GUARDED_HOST_EXECUTION: 'true' },
      }).allowed,
    ).toBe(true)

    expect(
      evaluateSandboxPolicy(
        request(),
        runner({ trustClass: 'unavailable', backend: 'unavailable' }),
        { mode: 'APPROVED_EXECUTION', env: {} },
      ).reason,
    ).toContain('selected runtime is unavailable')

    const generic = evaluateSandboxPolicy(
      request(),
      runner({ trustClass: 'container-isolated', backend: 'container' }),
      { mode: 'APPROVED_EXECUTION' },
    )
    expect(generic.allowed).toBe(true)
    expect(generic.reason).toContain('container-isolated execution allowed')
  })
})

describe('sandbox service fallback coverage', () => {
  it('returns empty history views without a history store', () => {
    const service = new SandboxService({
      inventory: inventory([]),
      now: () => new Date(CHECKED_AT),
      generateExecutionId: () => 'sandbox_empty_history',
    })

    expect(service.listExecutions()).toEqual({
      schemaVersion: 1,
      executions: [],
      warnings: [],
    })
    expect(service.getExecution('missing')).toBeUndefined()
  })

  it('returns unavailable results when no matching runner exists', async () => {
    const service = new SandboxService({
      inventory: inventory([]),
      now: () => new Date(CHECKED_AT),
      generateExecutionId: () => 'sandbox_no_runner',
    })

    const result = await service.execute(request(), { mode: 'APPROVED_EXECUTION' })

    expect(result.status).toBe('unavailable')
    expect(result.runnerId).toBe('unavailable-javascript')
    expect(result.evidence.policyReason).toContain('No available runner')
  })

  it('preserves a requested runner id when the runner does not support the language', async () => {
    const javascriptRunner = runner({ id: 'javascript-only' })
    const service = new SandboxService({
      inventory: inventory([javascriptRunner]),
      now: () => new Date(CHECKED_AT),
      generateExecutionId: () => 'sandbox_wrong_language',
    })

    const result = await service.execute(
      {
        languageId: 'python',
        mode: 'run',
        source: 'print("coverage")',
        requestedRunnerId: 'javascript-only',
      },
      { mode: 'APPROVED_EXECUTION' },
    )

    expect(result.status).toBe('unavailable')
    expect(result.runnerId).toBe('javascript-only')
  })

  it('rebuilds inventory with discovered command availability', async () => {
    const initial = inventory([])
    const refreshedRunner = runner({ id: 'refreshed-runner' })
    const service = new SandboxService({
      inventory: initial,
      buildInventory: (availability) =>
        availability?.has('node') === true ? inventory([refreshedRunner]) : initial,
      discoverCommandAvailability: async () =>
        new Map([
          [
            'node',
            {
              status: 'available' as const,
              checkedAt: CHECKED_AT,
              version: '22.0.0',
            },
          ],
        ]),
      now: () => new Date(CHECKED_AT),
      generateExecutionId: () => 'sandbox_refresh',
    })

    expect(service.listInventory().runners).toHaveLength(0)
    expect((await service.refreshInventory()).runners[0]?.id).toBe('refreshed-runner')
  })
})
