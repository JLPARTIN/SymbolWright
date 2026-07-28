import { describe, expect, it } from 'vitest'

import {
  SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
  SANDBOX_EGRESS_CAPABILITY,
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
  source: 'console.log(1)',
}

function runner(overrides: Partial<SandboxRunnerDefinition> = {}): SandboxRunnerDefinition {
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
    workspaceId: 'workspace-1',
    ...overrides,
  }
}

function offlineProfile(overrides: Partial<SandboxPolicyProfile> = {}): SandboxPolicyProfile {
  return {
    id: 'offline-test',
    version: 1,
    enabled: true,
    allowedIntents: ['offline-execution'],
    deploymentModes: ['local', 'hosted'],
    callerKinds: ['operator', 'delegated-grant', 'team-member', 'system'],
    allowedBackends: ['container', 'browser', 'wasm', 'guarded-host'],
    allowedTrustClasses: [
      'container-isolated',
      'browser-isolated',
      'wasm-isolated',
      'guarded-host',
    ],
    networkModes: ['disabled'],
    dependencyModes: ['disabled'],
    workspaceModes: ['temporary-copy', 'managed-mission', 'trusted-local-host'],
    artifactExport: 'quarantine-only',
    cleanupRequired: true,
    evidenceRequired: true,
    ...overrides,
  }
}

function profileResolution(
  profile: SandboxPolicyProfile,
  auth: Partial<SandboxAuthorizationContext> = {},
  request: SandboxExecutionRequest = REQUEST,
  selectedRunner: SandboxRunnerDefinition = runner(),
) {
  return resolveEffectiveSandboxPolicy({
    request,
    runner: selectedRunner,
    authorization: authorization({
      policyReference: { id: profile.id, version: profile.version },
      ...auth,
    }),
    catalog: new SandboxPolicyCatalog([profile]),
  })
}

function nonOfflineApproval(
  profile: SandboxPolicyProfile,
  capabilityId: string,
  additions: Readonly<Record<string, number>> = {},
) {
  return {
    id: 'approval-1',
    capabilityId,
    policyVersions: {
      [SANDBOX_GLOBAL_POLICY_ID]: 1,
      [profile.id]: profile.version,
      'runner:container-javascript': 1,
      'request-tightening': 1,
      ...additions,
    },
  }
}

describe('effective sandbox policy adversarial boundaries', () => {
  it('fails closed without capability, executable runtime mode, runner, or policy reference', () => {
    expect(
      resolveEffectiveSandboxPolicy({
        request: REQUEST,
        runner: runner(),
        authorization: authorization({ approvedCapabilityIds: [] }),
      }).reasonCode,
    ).toBe('SANDBOX_CAPABILITY_NOT_APPROVED')

    for (const runtimeMode of ['READ_ONLY', 'PLAN_ONLY', 'PROPOSAL_ONLY'] as const) {
      expect(
        resolveEffectiveSandboxPolicy({
          request: REQUEST,
          runner: runner(),
          authorization: authorization({ runtimeMode }),
        }).reasonCode,
      ).toBe('SANDBOX_RUNTIME_MODE_BLOCKED')
    }

    expect(
      resolveEffectiveSandboxPolicy({
        request: REQUEST,
        authorization: authorization(),
      }).reasonCode,
    ).toBe('SANDBOX_RUNNER_NOT_FOUND')

    expect(
      resolveEffectiveSandboxPolicy({
        request: REQUEST,
        runner: runner(),
        authorization: authorization({
          intent: 'egress-execution',
          approvedCapabilityIds: [SANDBOX_EGRESS_CAPABILITY],
        }),
      }).reasonCode,
    ).toBe('SANDBOX_POLICY_REFERENCE_REQUIRED')
  })

  it('rejects disabled profiles and stale expected source versions', () => {
    const disabled = offlineProfile({ enabled: false })
    expect(profileResolution(disabled).reasonCode).toBe('SANDBOX_POLICY_DISABLED')

    expect(
      profileResolution(offlineProfile(), {
        expectedPolicyVersions: { [SANDBOX_GLOBAL_POLICY_ID]: 2 },
      }).reasonCode,
    ).toBe('SANDBOX_POLICY_VERSION_STALE')
  })

  it('rejects every incompatible profile dimension', () => {
    expect(profileResolution(offlineProfile({ allowedIntents: [] })).reasonCode).toBe(
      'SANDBOX_INTENT_NOT_ALLOWED',
    )
    expect(profileResolution(offlineProfile({ deploymentModes: ['hosted'] })).reasonCode).toBe(
      'SANDBOX_DEPLOYMENT_NOT_ALLOWED',
    )
    expect(profileResolution(offlineProfile({ callerKinds: ['system'] })).reasonCode).toBe(
      'SANDBOX_CALLER_NOT_ALLOWED',
    )
    expect(profileResolution(offlineProfile({ allowedBackends: ['wasm'] })).reasonCode).toBe(
      'SANDBOX_BACKEND_NOT_ALLOWED',
    )
    expect(
      profileResolution(offlineProfile({ allowedTrustClasses: ['wasm-isolated'] })).reasonCode,
    ).toBe('SANDBOX_TRUST_CLASS_NOT_ALLOWED')
    expect(profileResolution(offlineProfile({ allowedLanguageIds: ['python'] })).reasonCode).toBe(
      'SANDBOX_LANGUAGE_NOT_ALLOWED',
    )
    expect(profileResolution(offlineProfile({ allowedModes: ['test'] })).reasonCode).toBe(
      'SANDBOX_MODE_NOT_ALLOWED',
    )
    expect(
      profileResolution(offlineProfile({ workspaceModes: ['managed-mission'] })).reasonCode,
    ).toBe('SANDBOX_WORKSPACE_MODE_NOT_ALLOWED')
  })

  it('treats an explicit empty or conflicting command intersection as deny-all', () => {
    expect(profileResolution(offlineProfile({ allowedCommands: [] })).reasonCode).toBe(
      'SANDBOX_COMMAND_POLICY_EMPTY',
    )
    expect(
      profileResolution(offlineProfile({ allowedCommands: ['npm'] }), {
        grantAllowedCommands: ['git'],
      }).reasonCode,
    ).toBe('SANDBOX_COMMAND_POLICY_EMPTY')

    const allowed = profileResolution(offlineProfile({ allowedCommands: ['npm', 'git'] }), {
      grantAllowedCommands: ['npm'],
    })
    expect(allowed.allowed).toBe(true)
    expect(allowed.policy?.commandPolicy).toBe('allowlist')
    expect(allowed.policy?.allowedCommands).toEqual(['npm'])
  })

  it('requires exact approval capability, grant version, and complete policy versions', () => {
    const profile: SandboxPolicyProfile = {
      ...offlineProfile({
        id: 'dependency-test',
        allowedIntents: ['dependency-acquisition'],
        networkModes: ['dependency-broker-only'],
        dependencyModes: ['brokered'],
      }),
    }
    const base = {
      intent: 'dependency-acquisition' as const,
      approvedCapabilityIds: [SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY],
      grantId: 'grant-1',
      grantVersion: 4,
    }

    expect(
      profileResolution(profile, {
        ...base,
        approval: {
          ...nonOfflineApproval(profile, SANDBOX_OFFLINE_EXECUTE_CAPABILITY, {
            'grant:grant-1': 4,
          }),
          grantVersion: 4,
        },
      }).reasonCode,
    ).toBe('SANDBOX_APPROVAL_CAPABILITY_MISMATCH')

    expect(
      profileResolution(profile, {
        ...base,
        approval: {
          ...nonOfflineApproval(profile, SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY, {
            'grant:grant-1': 4,
          }),
          grantVersion: 3,
        },
      }).reasonCode,
    ).toBe('SANDBOX_APPROVAL_GRANT_STALE')

    expect(
      profileResolution(profile, {
        ...base,
        approval: {
          id: 'approval-stale',
          capabilityId: SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
          grantVersion: 4,
          policyVersions: {
            [SANDBOX_GLOBAL_POLICY_ID]: 2,
            [profile.id]: 1,
            'runner:container-javascript': 1,
            'grant:grant-1': 4,
            'request-tightening': 1,
          },
        },
      }).reasonCode,
    ).toBe('SANDBOX_APPROVAL_POLICY_STALE')

    expect(
      profileResolution(profile, {
        ...base,
        approval: {
          id: 'approval-incomplete',
          capabilityId: SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
          grantVersion: 4,
          policyVersions: {
            [SANDBOX_GLOBAL_POLICY_ID]: 1,
            [profile.id]: 1,
            'runner:container-javascript': 1,
            'grant:grant-1': 4,
          },
        },
      }).reasonCode,
    ).toBe('SANDBOX_APPROVAL_POLICY_INCOMPLETE')
  })

  it('blocks unsupported network and dependency modes independently', () => {
    const networkBlocked = offlineProfile({
      id: 'dependency-network-blocked',
      allowedIntents: ['dependency-acquisition'],
      networkModes: ['disabled'],
      dependencyModes: ['brokered'],
    })
    expect(
      profileResolution(networkBlocked, {
        intent: 'dependency-acquisition',
        approvedCapabilityIds: [SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY],
        approval: nonOfflineApproval(networkBlocked, SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY),
      }).reasonCode,
    ).toBe('SANDBOX_NETWORK_POLICY_UNAVAILABLE')

    const dependencyBlocked = offlineProfile({
      id: 'dependency-mode-blocked',
      allowedIntents: ['dependency-acquisition'],
      networkModes: ['dependency-broker-only'],
      dependencyModes: ['disabled'],
    })
    expect(
      profileResolution(dependencyBlocked, {
        intent: 'dependency-acquisition',
        approvedCapabilityIds: [SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY],
        approval: nonOfflineApproval(dependencyBlocked, SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY),
      }).reasonCode,
    ).toBe('SANDBOX_DEPENDENCY_POLICY_UNAVAILABLE')
  })

  it('resolves explicit egress policy and mission/grant source versions', () => {
    const profile = offlineProfile({
      id: 'egress-test',
      version: 3,
      allowedIntents: ['egress-execution'],
      networkModes: ['allowlisted-egress'],
    })
    const result = profileResolution(profile, {
      intent: 'egress-execution',
      approvedCapabilityIds: [SANDBOX_EGRESS_CAPABILITY],
      missionId: 'mission-1',
      grantId: 'grant-1',
      grantVersion: 7,
      approval: {
        ...nonOfflineApproval(profile, SANDBOX_EGRESS_CAPABILITY, {
          'grant:grant-1': 7,
          'mission:mission-1': 1,
        }),
        grantVersion: 7,
      },
    })
    expect(result.allowed).toBe(true)
    expect(result.policy?.network.mode).toBe('allowlisted-egress')
    expect(result.policy?.dependencies.mode).toBe('disabled')
    expect(result.policy?.sources.map((source) => source.kind)).toContain('mission')
  })

  it('handles compile/test capability intersections and valid global version config', () => {
    const profile = offlineProfile({ allowedModes: ['compile', 'test'] })
    const compileResult = resolveEffectiveSandboxPolicy({
      request: { ...REQUEST, mode: 'compile' },
      runner: runner({
        capabilities: {
          ...runner().capabilities,
          run: false,
          compile: true,
          test: false,
        },
      }),
      authorization: authorization({
        policyReference: { id: profile.id, version: profile.version },
      }),
      catalog: new SandboxPolicyCatalog([profile]),
      env: { SYMBOLWRIGHT_SANDBOX_GLOBAL_POLICY_VERSION: '9' },
    })
    expect(compileResult.allowed).toBe(true)
    expect(compileResult.policy?.sources[0]).toMatchObject({ version: 9 })

    const invalidVersion = profileResolution(profile, {}, { ...REQUEST, mode: 'test' })
    expect(invalidVersion.allowed).toBe(true)
  })
})
