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

function runner(overrides: Partial<SandboxRunnerDefinition> = {}): SandboxRunnerDefinition {
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

function request(overrides: Partial<SandboxExecutionRequest> = {}): SandboxExecutionRequest {
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

function serviceWithRunner(): SandboxService {
  return new SandboxService({
    inventory: inventory([runner()]),
    now: () => new Date(CHECKED_AT),
    generateExecutionId: () => 'sandbox_policy_coverage',
  })
}

describe('sandbox policy branch coverage', () => {
  it('reports unavailable runners with explicit and fallback reasons', () => {
    const explicitRunner = runner({
      availability: {
        status: 'unavailable',
        checkedAt: CHECKED_AT,
        reason: 'runtime probe failed',
      },
    })
    const explicit = evaluateSandboxPolicy(request(), explicitRunner, {
      mode: 'APPROVED_EXECUTION',
      env: {},
    })
    expect(explicit).toEqual({ allowed: false, reason: 'runtime probe failed' })

    const fallbackRunner = runner({
      availability: {
        status: 'misconfigured',
        checkedAt: CHECKED_AT,
      },
    })
    const fallback = evaluateSandboxPolicy(request(), fallbackRunner, {
      mode: 'APPROVED_EXECUTION',
      env: {},
    })
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

    const runDecision = evaluateSandboxPolicy(request(), runner({ capabilities: noCapabilities }), {
      mode: 'APPROVED_EXECUTION',
      env: {},
    })
    expect(runDecision.reason).toContain('does not support run mode')

    const compileDecision = evaluateSandboxPolicy(
      request({ mode: 'compile' }),
      runner({ capabilities: noCapabilities }),
      { mode: 'APPROVED_EXECUTION', env: {} },
    )
    expect(compileDecision.reason).toContain('does not support compile mode')

    const testDecision = evaluateSandboxPolicy(
      request({ mode: 'test' }),
      runner({ capabilities: noCapabilities }),
      { mode: 'APPROVED_EXECUTION', env: {} },
    )
    expect(testDecision.reason).toContain('does not support test mode')

    const repositoryDecision = evaluateSandboxPolicy(
      request({ repository: { rootPath: '/tmp/repository' } }),
      runner({ capabilities: { ...noCapabilities, run: true } }),
      { mode: 'APPROVED_EXECUTION', env: {} },
    )
    expect(repositoryDecision.reason).toContain('does not support repository execution')
  })

  it('covers request validation edge branches', () => {
    const service = serviceWithRunner()
    const invalidPayloads: readonly unknown[] = [
      { languageId: 42, mode: 'run', source: 'x' },
      { languageId: 'javascript', mode: 'run', source: 'x', stdin: 7 },
      { languageId: 'javascript', mode: 'run', source: 'x', args: 'bad' },
      { languageId: 'javascript', mode: 'run', source: 'x', args: [1] },
      { languageId: 'javascript', mode: 'run', source: 'x', args: ['bad\0arg'] },
      { languageId: 'javascript', mode: 'run', source: 'x', limits: 'bad' },
      { languageId: 'javascript', mode: 'run', source: 'x', limits: { timeoutMs: 'fast' } },
      { languageId: 'javascript', mode: 'run', files: 'bad' },
      { languageId: 'javascript', mode: 'run', files: [] },
      {
        languageId: 'javascript',
        mode: 'run',
        limits: { maxFiles: 1 },
        files: [
          { path: 'one.js', content: '1' },
          { path: 'two.js', content: '2' },
        ],
      },
      { languageId: 'javascript', mode: 'run', files: [1] },
      { languageId: 'javascript', mode: 'run', files: [{ path: 'missing-content.js' }] },
      { languageId: 'javascript', mode: 'run', files: [{ path: '', content: 'x' }] },
      {
        languageId: 'javascript',
        mode: 'run',
        limits: { maxFileBytes: 3 },
        files: [{ path: 'large.js', content: 'larger' }],
      },
      {
        languageId: 'javascript',
        mode: 'run',
        limits: { maxFileBytes: 10, maxTotalSourceBytes: 15 },
        files: [
          { path: 'one.js', content: '1234567890' },
          { path: 'two.js', content: '1234567890' },
        ],
      },
      { languageId: 'javascript', mode: 'run', repository: 'bad' },
      { languageId: 'javascript', mode: 'run', repository: { rootPath: '' } },
      {
        languageId: 'javascript',
        mode: 'run',
        repository: { rootPath: '/tmp/repo', selectedPaths: 'bad' },
      },
      {
        languageId: 'javascript',
        mode: 'run',
        repository: { rootPath: '/tmp/repo', selectedPaths: [1] },
      },
      {
        languageId: 'javascript',
        mode: 'run',
        repository: { rootPath: '/tmp/repo', selectedPaths: ['../escape.js'] },
      },
    ]

    for (const payload of invalidPayloads) {
      expect(() => service.validateRequest(payload)).toThrow()
    }
  })

  it('blocks every non-execution runtime mode', () => {
    const candidate = runner()
    const readOnly = evaluateSandboxPolicy(request(), candidate, {
      mode: 'READ_ONLY',
      env: {},
    })
    const proposalOnly = evaluateSandboxPolicy(request(), candidate, {
      mode: 'PROPOSAL_ONLY',
      env: {},
    })
    const planOnly = evaluateSandboxPolicy(request(), candidate, {
      mode: 'PLAN_ONLY',
      env: {},
    })

    expect(readOnly.reason).toContain('READ_ONLY')
    expect(proposalOnly.reason).toContain('PROPOSAL_ONLY')
    expect(planOnly.reason).toContain('PLAN_ONLY')
  })

  it('covers guarded-host, unavailable, and generic trust decisions', () => {
    const guarded = runner({
      trustClass: 'guarded-host',
      backend: 'guarded-host',
    })
    const guardedBlocked = evaluateSandboxPolicy(request(), guarded, {
      mode: 'APPROVED_EXECUTION',
      env: {},
    })
    const guardedAllowed = evaluateSandboxPolicy(request(), guarded, {
      mode: 'APPROVED_EXECUTION',
      env: { SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION: 'true' },
    })
    const guardedHosted = evaluateSandboxPolicy(request(), guarded, {
      mode: 'APPROVED_EXECUTION',
      env: {
        SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION: 'true',
        SYMBOLWRIGHT_DEPLOYMENT_MODE: 'hosted',
      },
    })
    expect(guardedBlocked.allowed).toBe(false)
    expect(guardedAllowed.allowed).toBe(true)
    expect(guardedAllowed.reason).toContain('break-glass')
    expect(guardedHosted.allowed).toBe(false)
    expect(guardedHosted.reason).toContain('forbidden in hosted')

    const unavailable = evaluateSandboxPolicy(
      request(),
      runner({ trustClass: 'unavailable', backend: 'unavailable' }),
      { mode: 'APPROVED_EXECUTION', env: {} },
    )
    expect(unavailable.reason).toContain('selected runtime is unavailable')

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
