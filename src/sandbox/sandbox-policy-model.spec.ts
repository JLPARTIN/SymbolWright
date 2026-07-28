import { describe, expect, it } from 'vitest'

import {
  SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
  SANDBOX_OFFLINE_EXECUTE_CAPABILITY,
} from '../access/sandbox-capabilities.js'
import { DEFAULT_SANDBOX_LIMITS } from './sandbox-limits.js'
import {
  SANDBOX_GLOBAL_POLICY_ID,
  SandboxPolicyCatalog,
  resolveEffectiveSandboxPolicy,
  type SandboxAuthorizationContext,
  type SandboxPolicyProfile,
} from './sandbox-policy-model.js'
import type { SandboxExecutionRequest, SandboxRunnerDefinition } from './sandbox-types.js'

const REQUEST: SandboxExecutionRequest = {
  languageId: 'javascript',
  mode: 'run',
  source: "console.log('ok')",
}

function runner(
  overrides: Partial<SandboxRunnerDefinition> = {},
): SandboxRunnerDefinition {
  return {
    id: 'container-javascript',
    languageIds: ['javascript'],
    displayName: 'JavaScript container',
    trustClass: 'container-isolated',
    backend: 'container',
    availability: { status: 'available', checkedAt: '2026-07-28T00:00:00.000Z' },
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

function authorization(
  overrides: Partial<SandboxAuthorizationContext> = {},
): SandboxAuthorizationContext {
  return {
    deploymentMode: 'local',
    callerKind: 'operator',
    runtimeMode: 'APPROVED_EXECUTION',
    approvedCapabilityIds: [SANDBOX_OFFLINE_EXECUTE_CAPABILITY],
    repositoryId: 'JLPARTIN/SymbolWright',
    workspaceId: 'mission-1',
    ...overrides,
  }
}

describe('effective sandbox policy resolver', () => {
  it('resolves a deeply immutable offline policy by strict limit intersection', () => {
    const resolution = resolveEffectiveSandboxPolicy({
      request: { ...REQUEST, limits: { timeoutMs: 1_000, maxMemoryMb: 128 } },
      runner: runner(),
      authorization: authorization({
        grantLimits: { timeoutMs: 2_000, maxMemoryMb: 256 },
        missionLimits: { timeoutMs: 1_500, maxMemoryMb: 192 },
      }),
      now: () => new Date('2026-07-28T12:00:00.000Z'),
    })

    expect(resolution.allowed).toBe(true)
    const policy = resolution.policy
    expect(policy).toBeDefined()
    expect(policy?.requiredCapabilityId).toBe(SANDBOX_OFFLINE_EXECUTE_CAPABILITY)
    expect(policy?.network.mode).toBe('disabled')
    expect(policy?.dependencies.mode).toBe('disabled')
    expect(policy?.limits.timeoutMs).toBe(1_000)
    expect(policy?.limits.maxMemoryMb).toBe(128)
    expect(policy?.fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(Object.isFrozen(policy)).toBe(true)
    expect(Object.isFrozen(policy?.limits)).toBe(true)
    expect(Object.isFrozen(policy?.sources)).toBe(true)
  })

  it('never lets a request or lower authority widen any numeric cap', () => {
    for (let index = 1; index <= 40; index += 1) {
      const grantTimeout = 500 + index * 37
      const missionTimeout = 400 + index * 31
      const requestTimeout = 300 + index * 29
      const resolution = resolveEffectiveSandboxPolicy({
        request: { ...REQUEST, limits: { timeoutMs: requestTimeout } },
        runner: runner(),
        authorization: authorization({
          grantLimits: { timeoutMs: grantTimeout },
          missionLimits: { timeoutMs: missionTimeout },
        }),
      })
      expect(resolution.allowed).toBe(true)
      expect(resolution.policy?.limits.timeoutMs).toBeLessThanOrEqual(grantTimeout)
      expect(resolution.policy?.limits.timeoutMs).toBeLessThanOrEqual(missionTimeout)
      expect(resolution.policy?.limits.timeoutMs).toBeLessThanOrEqual(requestTimeout)
      expect(resolution.policy?.limits.timeoutMs).toBeLessThanOrEqual(
        DEFAULT_SANDBOX_LIMITS.timeoutMs,
      )
    }
  })

  it('fails closed on the emergency global disable switch', () => {
    const resolution = resolveEffectiveSandboxPolicy({
      request: REQUEST,
      runner: runner(),
      authorization: authorization(),
      env: { SYMBOLWRIGHT_DISABLE_SANDBOX_EXECUTION: 'true' },
    })
    expect(resolution).toMatchObject({
      allowed: false,
      reasonCode: 'SANDBOX_GLOBALLY_DISABLED',
    })
  })

  it('denies stale or missing policy references', () => {
    const stale = resolveEffectiveSandboxPolicy({
      request: REQUEST,
      runner: runner(),
      authorization: authorization({
        policyReference: { id: 'sandbox-offline-default', version: 99 },
      }),
    })
    expect(stale.reasonCode).toBe('SANDBOX_POLICY_VERSION_STALE')

    const missing = resolveEffectiveSandboxPolicy({
      request: REQUEST,
      runner: runner(),
      authorization: authorization({
        policyReference: { id: 'not-installed', version: 1 },
      }),
    })
    expect(missing.reasonCode).toBe('SANDBOX_POLICY_NOT_FOUND')
  })

  it('requires dependency acquisition to use an explicit policy and current bound approval', () => {
    const dependencyProfile: SandboxPolicyProfile = {
      id: 'node-dependency-profile',
      version: 2,
      enabled: true,
      allowedIntents: ['dependency-acquisition'],
      deploymentModes: ['local', 'hosted'],
      callerKinds: ['operator', 'delegated-grant'],
      allowedBackends: ['container'],
      allowedTrustClasses: ['container-isolated'],
      networkModes: ['dependency-broker-only'],
      dependencyModes: ['brokered'],
      workspaceModes: ['temporary-copy', 'managed-mission'],
      artifactExport: 'quarantine-only',
      cleanupRequired: true,
      evidenceRequired: true,
    }
    const catalog = new SandboxPolicyCatalog([dependencyProfile])
    const baseAuthorization = authorization({
      callerKind: 'delegated-grant',
      intent: 'dependency-acquisition',
      approvedCapabilityIds: [SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY],
      grantId: 'grant-1',
      grantVersion: 4,
      policyReference: { id: dependencyProfile.id, version: dependencyProfile.version },
    })

    const noApproval = resolveEffectiveSandboxPolicy({
      request: REQUEST,
      runner: runner(),
      authorization: baseAuthorization,
      catalog,
    })
    expect(noApproval.reasonCode).toBe('SANDBOX_APPROVAL_REQUIRED')

    const staleGrant = resolveEffectiveSandboxPolicy({
      request: REQUEST,
      runner: runner(),
      authorization: {
        ...baseAuthorization,
        approval: {
          id: 'approval-1',
          capabilityId: SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
          grantVersion: 3,
          policyVersions: {},
        },
      },
      catalog,
    })
    expect(staleGrant.reasonCode).toBe('SANDBOX_APPROVAL_GRANT_STALE')

    const sourceVersions = {
      [SANDBOX_GLOBAL_POLICY_ID]: 1,
      [dependencyProfile.id]: dependencyProfile.version,
      'runner:container-javascript': 1,
      'grant:grant-1': 4,
      'request-tightening': 1,
    }
    const allowed = resolveEffectiveSandboxPolicy({
      request: REQUEST,
      runner: runner(),
      authorization: {
        ...baseAuthorization,
        approval: {
          id: 'approval-2',
          capabilityId: SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
          grantVersion: 4,
          policyVersions: sourceVersions,
        },
      },
      catalog,
    })
    expect(allowed.allowed).toBe(true)
    expect(allowed.policy?.network.mode).toBe('dependency-broker-only')
    expect(allowed.policy?.dependencies.mode).toBe('brokered')
  })

  it('denies guarded-host for hosted or delegated authority before execution', () => {
    const guarded = runner({
      id: 'guarded-host-javascript',
      backend: 'guarded-host',
      trustClass: 'guarded-host',
    })
    const hosted = resolveEffectiveSandboxPolicy({
      request: REQUEST,
      runner: guarded,
      authorization: authorization({ deploymentMode: 'hosted' }),
    })
    expect(hosted.reasonCode).toBe('GUARDED_HOST_HOSTED_FORBIDDEN')

    const delegated = resolveEffectiveSandboxPolicy({
      request: REQUEST,
      runner: guarded,
      authorization: authorization({ callerKind: 'delegated-grant' }),
    })
    expect(delegated.reasonCode).toBe('GUARDED_HOST_CALLER_FORBIDDEN')
  })
})
