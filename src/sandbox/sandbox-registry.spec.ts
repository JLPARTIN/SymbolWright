import { describe, expect, it } from 'vitest'

import { evaluateSandboxPolicy } from './sandbox-policy.js'
import {
  buildSandboxInventory,
  findSandboxRunner,
  listSandboxLanguageIds,
  listSandboxRunnerIds,
  runnerAvailability,
  STATIC_SANDBOX_INVENTORY_FOR_TESTS,
  STRONG_SANDBOX_JAVASCRIPT_RUNNER_ID,
} from './sandbox-registry.js'
import {
  containsRepresentativeSandboxSecret,
  redactSandboxText,
  sha256Text,
} from './sandbox-redaction.js'
import { SandboxService } from './sandbox-service.js'

const CHECKED_AT = '2026-07-20T00:00:00.000Z'

describe('sandbox runtime inventory', () => {
  it('registers browser-isolated existing runners without promoting edit-only languages by default', () => {
    const inventory = STATIC_SANDBOX_INVENTORY_FOR_TESTS
    const javascript = findSandboxRunner(inventory, 'javascript')
    const python = findSandboxRunner(inventory, 'python')
    const go = findSandboxRunner(inventory, 'go')

    expect(javascript?.trustClass).toBe('browser-isolated')
    expect(python?.id).toBe('browser-pyodide')
    expect(go).toBeUndefined()
    expect(listSandboxLanguageIds()).toContain('rust')
    expect(listSandboxRunnerIds(inventory)).toContain('guarded-host-go')
    expect(listSandboxRunnerIds(inventory)).toContain(STRONG_SANDBOX_JAVASCRIPT_RUNNER_ID)
  })

  it('exposes one digest-pinned image without enabling execution by default', () => {
    const inventory = buildSandboxInventory({
      now: () => new Date(CHECKED_AT),
      env: {},
      commandAvailability: new Map([
        [
          'docker',
          runnerAvailability('available', CHECKED_AT, {
            version: '27.0.0',
          }),
        ],
      ]),
    })

    expect(inventory.images.map((image) => image.id)).toEqual(['node-26-alpine-pinned'])
    expect(inventory.images[0]?.image).toContain('@sha256:')
    expect(inventory.images[0]?.enabled).toBe(false)
    expect(inventory.images[0]?.installed).toBeUndefined()
    const runner = inventory.runners.find(
      (candidate) => candidate.id === STRONG_SANDBOX_JAVASCRIPT_RUNNER_ID,
    )
    expect(runner?.availability.status).toBe('unavailable')
    expect(runner?.availability.reason).toContain('disabled by operator policy')
    expect(inventory.warnings.join('\n')).toContain('digest-pinned')
    expect(inventory.warnings.join('\n')).toContain('--pull=never')
  })

  it('enables the strong JavaScript runner only with operator opt-in and an available engine', () => {
    const inventory = buildSandboxInventory({
      now: () => new Date(CHECKED_AT),
      env: { SYMBOLWRIGHT_ENABLE_STRONG_CONTAINER_EXECUTION: 'true' },
      commandAvailability: new Map([
        [
          'docker',
          runnerAvailability('available', CHECKED_AT, {
            version: '27.0.0',
          }),
        ],
      ]),
    })
    const runner = inventory.runners.find(
      (candidate) => candidate.id === STRONG_SANDBOX_JAVASCRIPT_RUNNER_ID,
    )
    expect(runner?.availability.status).toBe('available')
    expect(runner?.container).toMatchObject({
      engine: 'docker',
      imageId: 'node-26-alpine-pinned',
      pullPolicy: 'never',
      networkMode: 'none',
      workspaceMode: 'copy-in-tmpfs-copy-out',
    })
    expect(findSandboxRunner(inventory, 'javascript')?.id).toBe(
      STRONG_SANDBOX_JAVASCRIPT_RUNNER_ID,
    )
  })

  it('keeps guarded-host unavailable unless explicitly opted in', () => {
    const disabled = buildSandboxInventory({
      now: () => new Date(CHECKED_AT),
      env: {},
      commandAvailability: new Map([
        [
          'python3',
          runnerAvailability('available', CHECKED_AT, {
            version: '3.12.0',
          }),
        ],
      ]),
    })
    const disabledPython = disabled.runners.find((runner) => runner.id === 'guarded-host-python')
    expect(disabledPython?.availability.status).toBe('unavailable')
    expect(disabledPython?.availability.version).toBe('3.12.0')
    expect(disabledPython?.availability.reason).toContain('disabled by default')

    const enabled = buildSandboxInventory({
      now: () => new Date(CHECKED_AT),
      env: { SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION: 'true' },
      commandAvailability: new Map([
        [
          'python3',
          runnerAvailability('available', CHECKED_AT, {
            version: '3.12.0',
          }),
        ],
      ]),
    })
    const python = enabled.runners.find((runner) => runner.id === 'guarded-host-python')
    expect(python?.availability.status).toBe('available')
    expect(python?.availability.version).toBe('3.12.0')
  })
})

describe('sandbox policy and service foundation', () => {
  const inventory = buildSandboxInventory({
    now: () => new Date(CHECKED_AT),
    env: {},
  })
  const request = {
    languageId: 'javascript',
    mode: 'run',
    source: 'console.log("hello")',
    requestedRunnerId: 'browser-javascript',
  }

  it('blocks execution in read-only and proposal-only modes with structured reasons', async () => {
    const service = new SandboxService({
      inventory,
      now: () => new Date(CHECKED_AT),
      generateExecutionId: () => 'sandbox_test',
    })

    const readOnly = await service.execute(request, { mode: 'READ_ONLY' })
    expect(readOnly.status).toBe('policy-blocked')
    expect(readOnly.evidence.policyReason).toContain('READ_ONLY')

    const proposal = await service.execute(request, { mode: 'PROPOSAL_ONLY' })
    expect(proposal.status).toBe('policy-blocked')
    expect(proposal.evidence.policyReason).toContain('PROPOSAL_ONLY')
  })

  it('does not fake browser execution through the server backend', async () => {
    const service = new SandboxService({
      inventory,
      now: () => new Date(CHECKED_AT),
      generateExecutionId: () => 'sandbox_test',
    })
    const result = await service.execute(request, {
      mode: 'APPROVED_EXECUTION',
    })
    expect(result.status).toBe('policy-blocked')
    expect(result.trustClass).toBe('browser-isolated')
    expect(result.evidence.verificationLevel).toBe('UNVERIFIED')
    expect(result.evidence.policyReason).toContain('No execution backend')
  })

  it('requires explicit guarded-host opt-in', () => {
    const guarded = buildSandboxInventory({
      env: { SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION: 'true' },
      commandAvailability: new Map([['python3', runnerAvailability('available', CHECKED_AT)]]),
    }).runners.find((runner) => runner.id === 'guarded-host-python')
    expect(guarded).toBeDefined()
    if (guarded === undefined) throw new Error('guarded runner missing')

    const blocked = evaluateSandboxPolicy(
      {
        languageId: 'python',
        mode: 'run',
        source: 'print(1)',
        requestedRunnerId: 'guarded-host-python',
      },
      guarded,
      { mode: 'APPROVED_EXECUTION', env: {} },
    )
    expect(blocked.allowed).toBe(false)
    expect(blocked.reason).toContain('disabled')

    const allowed = evaluateSandboxPolicy(
      {
        languageId: 'python',
        mode: 'run',
        source: 'print(1)',
        requestedRunnerId: 'guarded-host-python',
      },
      guarded,
      {
        mode: 'APPROVED_EXECUTION',
        env: { SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION: 'true' },
      },
    )
    expect(allowed.allowed).toBe(true)
  })

  it('refreshes inventory from bounded runtime discovery without executing code', async () => {
    const service = new SandboxService({
      env: { SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION: 'true' },
      buildInventory: (commandAvailability) =>
        buildSandboxInventory({
          env: { SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION: 'true' },
          now: () => new Date(CHECKED_AT),
          ...(commandAvailability === undefined ? {} : { commandAvailability }),
        }),
      discoverCommandAvailability: async () =>
        new Map([
          [
            'python3',
            runnerAvailability('available', CHECKED_AT, {
              version: '3.12.1',
            }),
          ],
        ]),
    })

    const refreshed = await service.refreshInventory()
    const python = refreshed.runners.find((runner) => runner.id === 'guarded-host-python')
    expect(python?.availability.status).toBe('available')
    expect(python?.availability.version).toBe('3.12.1')
  })
})

describe('sandbox redaction', () => {
  it('redacts representative secrets before evidence can persist', () => {
    const text =
      'Authorization: Bearer abcdefghijklmnop and ghp_123456789012345678901234567890123456'
    const redacted = redactSandboxText(text)
    expect(redacted).not.toContain('abcdefghijklmnop')
    expect(redacted).not.toContain('ghp_123')
    expect(containsRepresentativeSandboxSecret(redacted)).toBe(false)
    expect(sha256Text('input')).toHaveLength(64)
  })
})
