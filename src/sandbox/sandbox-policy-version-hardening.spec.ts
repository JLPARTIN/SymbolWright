import { describe, expect, it } from 'vitest'

import {
  SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
  SANDBOX_EGRESS_CAPABILITY,
  SANDBOX_OFFLINE_EXECUTE_CAPABILITY,
} from '../access/sandbox-capabilities.js'
import { EnvironmentDependencyPolicyRevisionSource } from './dependency-acquisition-service.js'
import {
  DEFAULT_DEPENDENCY_ACQUISITION_LIMITS,
  DEPENDENCY_GLOBAL_POLICY_ID,
  DependencyPolicyCatalog,
  resolveEffectiveDependencyPolicy,
  type DependencyPolicyProfile,
} from './dependency-policy.js'
import { EnvironmentEgressPolicyRevisionSource } from './egress-broker.js'
import {
  DEFAULT_EGRESS_POLICY_LIMITS,
  EGRESS_GLOBAL_POLICY_ID,
  EgressPolicyCatalog,
  resolveEffectiveEgressPolicy,
  type EgressPolicyProfile,
} from './egress-policy.js'
import { DEFAULT_SANDBOX_LIMITS } from './sandbox-limits.js'
import {
  resolveEffectiveSandboxPolicy,
  type SandboxAuthorizationContext,
} from './sandbox-policy-model.js'
import { readPolicyVersion } from './policy-version.js'
import type { SandboxExecutionRequest, SandboxRunnerDefinition } from './sandbox-types.js'

const DEPENDENCY_PROFILE: DependencyPolicyProfile = {
  id: 'npm-production',
  version: 3,
  enabled: true,
  ecosystems: ['npm'],
  deploymentModes: ['hosted'],
  callerKinds: ['delegated-grant'],
  allowedRegistries: ['https://registry.npmjs.org/'],
  requireLockfile: true,
  allowLockfileMutation: false,
  suppressLifecycleScripts: true,
  directIpDestinations: 'denied',
  cacheNamespace: 'npm-production-v3',
  limits: DEFAULT_DEPENDENCY_ACQUISITION_LIMITS,
}

const EGRESS_PROFILE: EgressPolicyProfile = {
  id: 'runtime-api',
  version: 3,
  enabled: true,
  deploymentModes: ['hosted'],
  callerKinds: ['delegated-grant'],
  allowedHosts: ['api.example.com'],
  allowedMethods: ['GET'],
  allowedRequestHeaders: ['accept'],
  allowedPorts: [443],
  redirectPolicy: 'denied',
  credentialPolicy: 'none',
  requireTls: true,
  auditRetentionDays: 30,
  limits: DEFAULT_EGRESS_POLICY_LIMITS,
}

function networkAuthorization(
  capabilityId: string,
  profile: { readonly id: string; readonly version: number },
  requestSourceId: string,
  globalSourceId: string,
): SandboxAuthorizationContext {
  return {
    deploymentMode: 'hosted',
    callerKind: 'delegated-grant',
    runtimeMode: 'APPROVED_EXECUTION',
    approvedCapabilityIds: [capabilityId],
    repositoryId: 'repository-1',
    workspaceId: 'workspace-1',
    missionId: 'mission-1',
    grantId: 'grant-1',
    grantVersion: 7,
    policyReference: { id: profile.id, version: profile.version },
    approval: {
      id: 'approval-1',
      capabilityId,
      grantVersion: 7,
      policyVersions: {
        [globalSourceId]: 1,
        [profile.id]: profile.version,
        'grant:grant-1': 7,
        'mission:mission-1': 1,
        [requestSourceId]: 1,
      },
    },
  }
}

const REQUEST: SandboxExecutionRequest = {
  languageId: 'javascript',
  mode: 'run',
  source: "console.log('ok')",
}

const RUNNER: SandboxRunnerDefinition = {
  id: 'container-javascript',
  languageIds: ['javascript'],
  displayName: 'JavaScript container',
  trustClass: 'container-isolated',
  backend: 'container',
  availability: { status: 'available', checkedAt: '2026-07-29T00:00:00.000Z' },
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
}

describe('sandbox policy version hardening', () => {
  it('uses a trusted fallback only when the environment value is absent', () => {
    expect(readPolicyVersion(undefined, 4)).toEqual({ valid: true, value: 4 })
    for (const value of ['', '0', '-1', '1.5', 'abc', '9007199254740992']) {
      expect(readPolicyVersion(value, 4)).toEqual({ valid: false, value: 0 })
    }
  })

  it('denies malformed global offline sandbox authority', () => {
    const decision = resolveEffectiveSandboxPolicy({
      request: REQUEST,
      runner: RUNNER,
      authorization: {
        deploymentMode: 'hosted',
        callerKind: 'delegated-grant',
        runtimeMode: 'APPROVED_EXECUTION',
        approvedCapabilityIds: [SANDBOX_OFFLINE_EXECUTE_CAPABILITY],
        repositoryId: 'repository-1',
        workspaceId: 'workspace-1',
      },
      env: { SYMBOLWRIGHT_SANDBOX_GLOBAL_POLICY_VERSION: 'malformed' },
    })

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'SANDBOX_GLOBAL_POLICY_VERSION_INVALID',
    })
  })

  it('denies malformed global dependency authority', () => {
    const decision = resolveEffectiveDependencyPolicy({
      request: { ecosystem: 'npm' },
      authorization: networkAuthorization(
        SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
        DEPENDENCY_PROFILE,
        'dependency-request-tightening',
        DEPENDENCY_GLOBAL_POLICY_ID,
      ),
      catalog: new DependencyPolicyCatalog([DEPENDENCY_PROFILE]),
      env: { SYMBOLWRIGHT_DEPENDENCY_GLOBAL_POLICY_VERSION: 'malformed' },
    })

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'DEPENDENCY_GLOBAL_POLICY_VERSION_INVALID',
    })
  })

  it('denies malformed global egress authority', () => {
    const decision = resolveEffectiveEgressPolicy({
      request: {},
      authorization: networkAuthorization(
        SANDBOX_EGRESS_CAPABILITY,
        EGRESS_PROFILE,
        'egress-request-tightening',
        EGRESS_GLOBAL_POLICY_ID,
      ),
      catalog: new EgressPolicyCatalog([EGRESS_PROFILE]),
      env: { SYMBOLWRIGHT_EGRESS_GLOBAL_POLICY_VERSION: 'malformed' },
    })

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'EGRESS_GLOBAL_POLICY_VERSION_INVALID',
      state: 'denied',
    })
  })

  it('turns malformed live dependency versions into a revocation sentinel', () => {
    const policy = resolveEffectiveDependencyPolicy({
      request: { ecosystem: 'npm' },
      authorization: networkAuthorization(
        SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
        DEPENDENCY_PROFILE,
        'dependency-request-tightening',
        DEPENDENCY_GLOBAL_POLICY_ID,
      ),
      catalog: new DependencyPolicyCatalog([DEPENDENCY_PROFILE]),
      env: {},
    }).policy!

    expect(
      new EnvironmentDependencyPolicyRevisionSource({
        SYMBOLWRIGHT_DEPENDENCY_GLOBAL_POLICY_VERSION: 'invalid',
        SYMBOLWRIGHT_DEPENDENCY_POLICY_VERSION_NPM_PRODUCTION: '0',
      }).read(policy),
    ).toMatchObject({ globalVersion: 0, policyVersion: 0 })
  })

  it('turns malformed live egress versions into a revocation sentinel', () => {
    const policy = resolveEffectiveEgressPolicy({
      request: {},
      authorization: networkAuthorization(
        SANDBOX_EGRESS_CAPABILITY,
        EGRESS_PROFILE,
        'egress-request-tightening',
        EGRESS_GLOBAL_POLICY_ID,
      ),
      catalog: new EgressPolicyCatalog([EGRESS_PROFILE]),
      env: {},
    }).policy!

    expect(
      new EnvironmentEgressPolicyRevisionSource({
        SYMBOLWRIGHT_EGRESS_GLOBAL_POLICY_VERSION: 'invalid',
        SYMBOLWRIGHT_EGRESS_POLICY_VERSION_RUNTIME_API: '-1',
      }).read(policy),
    ).toMatchObject({ globalVersion: 0, policyVersion: 0 })
  })
})
