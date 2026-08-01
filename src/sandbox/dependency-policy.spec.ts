import { describe, expect, it } from 'vitest'

import { SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY } from '../access/sandbox-capabilities.js'
import type { SandboxAuthorizationContext } from './sandbox-policy-model.js'
import {
  DEFAULT_DEPENDENCY_ACQUISITION_LIMITS,
  DEPENDENCY_GLOBAL_POLICY_ID,
  DependencyPolicyCatalog,
  isUrlAllowedByRegistryPolicy,
  normalizeRegistryUrl,
  resolveEffectiveDependencyPolicy,
  type DependencyPolicyProfile,
} from './dependency-policy.js'

const PROFILE: DependencyPolicyProfile = {
  id: 'npm-production',
  version: 3,
  enabled: true,
  ecosystems: ['npm'],
  deploymentModes: ['local', 'hosted'],
  callerKinds: ['operator', 'delegated-grant', 'system'],
  allowedRegistries: ['https://registry.npmjs.org/'],
  requireLockfile: true,
  allowLockfileMutation: false,
  suppressLifecycleScripts: true,
  directIpDestinations: 'denied',
  cacheNamespace: 'npm-production-v3',
  limits: DEFAULT_DEPENDENCY_ACQUISITION_LIMITS,
}

function authorization(
  overrides: Partial<SandboxAuthorizationContext> = {},
): SandboxAuthorizationContext {
  return {
    deploymentMode: 'hosted',
    callerKind: 'delegated-grant',
    runtimeMode: 'APPROVED_EXECUTION',
    approvedCapabilityIds: [SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY],
    repositoryId: 'repository-1',
    workspaceId: 'workspace-1',
    missionId: 'mission-1',
    grantId: 'grant-1',
    grantVersion: 7,
    policyReference: { id: PROFILE.id, version: PROFILE.version },
    approval: {
      id: 'approval-1',
      capabilityId: SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
      grantVersion: 7,
      policyVersions: {
        [DEPENDENCY_GLOBAL_POLICY_ID]: 1,
        [PROFILE.id]: PROFILE.version,
        'grant:grant-1': 7,
        'mission:mission-1': 1,
        'dependency-request-tightening': 1,
      },
    },
    ...overrides,
  }
}

function withoutPolicyReference(value: SandboxAuthorizationContext): SandboxAuthorizationContext {
  const { policyReference, ...rest } = value
  void policyReference
  return rest
}

function withoutApproval(value: SandboxAuthorizationContext): SandboxAuthorizationContext {
  const { approval, ...rest } = value
  void approval
  return rest
}

function resolve(
  overrides: {
    readonly authorization?: SandboxAuthorizationContext
    readonly catalog?: DependencyPolicyCatalog
    readonly registryUrls?: readonly string[]
    readonly env?: NodeJS.ProcessEnv
    readonly limits?: { readonly maxPackages?: number; readonly timeoutMs?: number }
  } = {},
) {
  return resolveEffectiveDependencyPolicy({
    request: {
      ecosystem: 'npm',
      ...(overrides.registryUrls === undefined ? {} : { registryUrls: overrides.registryUrls }),
      ...(overrides.limits === undefined ? {} : { limits: overrides.limits }),
    },
    authorization: overrides.authorization ?? authorization(),
    catalog: overrides.catalog ?? new DependencyPolicyCatalog([PROFILE]),
    env: overrides.env ?? {},
    now: () => new Date('2026-07-29T00:00:00.000Z'),
  })
}

describe('governed dependency policy', () => {
  it('resolves an immutable, approval-bound npm policy', () => {
    const decision = resolve()

    expect(decision.allowed).toBe(true)
    expect(decision.policy).toMatchObject({
      policyId: PROFILE.id,
      policyVersion: PROFILE.version,
      ecosystem: 'npm',
      capabilityId: SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
      allowedRegistries: ['https://registry.npmjs.org/'],
      requireLockfile: true,
      allowLockfileMutation: false,
      suppressLifecycleScripts: true,
      directIpDestinations: 'denied',
    })
    expect(decision.policy?.fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(Object.isFrozen(decision.policy)).toBe(true)
    expect(Object.isFrozen(decision.policy?.limits)).toBe(true)
  })

  it('requires explicit capability, policy reference, and operator approval', () => {
    const missingCapability = resolve({
      authorization: authorization({ approvedCapabilityIds: [] }),
    })
    const missingReference = resolve({
      authorization: withoutPolicyReference(authorization()),
    })
    const missingApproval = resolve({
      authorization: withoutApproval(authorization()),
    })

    expect(missingCapability.reasonCode).toBe('DEPENDENCY_CAPABILITY_NOT_APPROVED')
    expect(missingReference.reasonCode).toBe('DEPENDENCY_POLICY_REFERENCE_REQUIRED')
    expect(missingApproval.reasonCode).toBe('DEPENDENCY_APPROVAL_REQUIRED')
  })

  it('rejects missing, disabled, incompatible, and empty registry policies', () => {
    expect(resolve({ catalog: new DependencyPolicyCatalog() }).reasonCode).toBe(
      'DEPENDENCY_POLICY_NOT_FOUND',
    )
    expect(
      resolve({
        catalog: new DependencyPolicyCatalog([{ ...PROFILE, enabled: false }]),
      }).reasonCode,
    ).toBe('DEPENDENCY_POLICY_DISABLED')
    expect(
      resolve({
        catalog: new DependencyPolicyCatalog([{ ...PROFILE, ecosystems: [] }]),
      }).reasonCode,
    ).toBe('DEPENDENCY_ECOSYSTEM_UNSUPPORTED')
    expect(resolve({ registryUrls: [] }).reasonCode).toBe('DEPENDENCY_REGISTRY_POLICY_EMPTY')
  })

  it('rejects stale policy and approval versions', () => {
    const stalePolicy = resolve({
      authorization: authorization({
        policyReference: { id: PROFILE.id, version: PROFILE.version - 1 },
      }),
      catalog: new DependencyPolicyCatalog([PROFILE, { ...PROFILE, version: PROFILE.version - 1 }]),
    })
    const staleApproval = resolve({
      authorization: authorization({
        approval: {
          id: 'approval-stale',
          capabilityId: SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
          grantVersion: 7,
          policyVersions: {
            [DEPENDENCY_GLOBAL_POLICY_ID]: 1,
            [PROFILE.id]: PROFILE.version - 1,
            'grant:grant-1': 7,
            'mission:mission-1': 1,
            'dependency-request-tightening': 1,
          },
        },
      }),
    })

    expect(stalePolicy.reasonCode).toBe('DEPENDENCY_POLICY_VERSION_STALE')
    expect(staleApproval.reasonCode).toBe('DEPENDENCY_APPROVAL_POLICY_STALE')
  })

  it('rejects mismatched, stale, and incomplete approval bindings', () => {
    const capabilityMismatch = resolve({
      authorization: authorization({
        approval: {
          ...authorization().approval!,
          capabilityId: 'symbolwright.sandbox.execute',
        },
      }),
    })
    const grantStale = resolve({
      authorization: authorization({
        approval: {
          ...authorization().approval!,
          grantVersion: 6,
        },
      }),
    })
    const { [PROFILE.id]: omitted, ...incompleteVersions } =
      authorization().approval!.policyVersions
    void omitted
    const incomplete = resolve({
      authorization: authorization({
        approval: {
          ...authorization().approval!,
          policyVersions: incompleteVersions,
        },
      }),
    })

    expect(capabilityMismatch.reasonCode).toBe('DEPENDENCY_APPROVAL_CAPABILITY_MISMATCH')
    expect(grantStale.reasonCode).toBe('DEPENDENCY_APPROVAL_GRANT_STALE')
    expect(incomplete.reasonCode).toBe('DEPENDENCY_APPROVAL_POLICY_INCOMPLETE')
  })

  it('rejects unsupported callers, deployment modes, and runtime modes', () => {
    const teamMember = resolve({
      authorization: authorization({ callerKind: 'team-member' }),
    })
    const localOnly = resolve({
      catalog: new DependencyPolicyCatalog([{ ...PROFILE, deploymentModes: ['local'] }]),
    })
    const readOnly = resolve({
      authorization: authorization({ runtimeMode: 'READ_ONLY' }),
    })

    expect(teamMember.reasonCode).toBe('DEPENDENCY_CALLER_NOT_ALLOWED')
    expect(localOnly.reasonCode).toBe('DEPENDENCY_DEPLOYMENT_NOT_ALLOWED')
    expect(readOnly.reasonCode).toBe('DEPENDENCY_RUNTIME_MODE_BLOCKED')
  })

  it('resolves policies without optional grant and mission sources', () => {
    const { grantId, grantVersion, missionId, ...unscopedAuthorization } = authorization()
    void grantId
    void grantVersion
    void missionId

    const decision = resolve({ authorization: unscopedAuthorization })

    expect(decision.allowed).toBe(true)
    expect(decision.policy?.sources.map((source) => source.kind)).toEqual([
      'global',
      'operator-profile',
      'request',
    ])
  })

  it('allows request limits only to tighten the operator profile', () => {
    const tightened = resolve({ limits: { maxPackages: 25, timeoutMs: 10_000 } })
    const fractional = resolve({ limits: { maxPackages: 3.9, timeoutMs: Number.NaN } })
    const invalid = resolve({ limits: { maxPackages: 0, timeoutMs: -1 } })
    const attemptedWidening = resolve({
      limits: {
        maxPackages: PROFILE.limits.maxPackages * 2,
        timeoutMs: PROFILE.limits.timeoutMs * 2,
      },
    })

    expect(tightened.policy?.limits.maxPackages).toBe(25)
    expect(tightened.policy?.limits.timeoutMs).toBe(10_000)
    expect(fractional.policy?.limits.maxPackages).toBe(3)
    expect(fractional.policy?.limits.timeoutMs).toBe(PROFILE.limits.timeoutMs)
    expect(invalid.policy?.limits.maxPackages).toBe(PROFILE.limits.maxPackages)
    expect(invalid.policy?.limits.timeoutMs).toBe(PROFILE.limits.timeoutMs)
    expect(attemptedWidening.policy?.limits.maxPackages).toBe(PROFILE.limits.maxPackages)
    expect(attemptedWidening.policy?.limits.timeoutMs).toBe(PROFILE.limits.timeoutMs)
  })

  it('uses valid global policy revisions and rejects stale approval revisions', () => {
    const current = resolve({
      env: { SYMBOLWRIGHT_DEPENDENCY_GLOBAL_POLICY_VERSION: '9' },
      authorization: authorization({
        approval: {
          ...authorization().approval!,
          policyVersions: {
            ...authorization().approval!.policyVersions,
            [DEPENDENCY_GLOBAL_POLICY_ID]: 9,
          },
        },
      }),
    })
    const invalidRevision = resolve({
      env: { SYMBOLWRIGHT_DEPENDENCY_GLOBAL_POLICY_VERSION: 'not-a-version' },
    })
    const unsafeRevision = resolve({
      env: { SYMBOLWRIGHT_DEPENDENCY_GLOBAL_POLICY_VERSION: '999999999999999999999999' },
    })

    expect(current.allowed).toBe(true)
    expect(current.policy?.sources[0]?.version).toBe(9)
    expect(invalidRevision).toMatchObject({
      allowed: false,
      reasonCode: 'DEPENDENCY_GLOBAL_POLICY_VERSION_INVALID',
    })
    expect(unsafeRevision).toMatchObject({
      allowed: false,
      reasonCode: 'DEPENDENCY_GLOBAL_POLICY_VERSION_INVALID',
    })
  })

  it('rejects registries outside the exact operator-owned HTTPS path', () => {
    expect(resolve({ registryUrls: ['https://registry.npmjs.org/private/'] }).allowed).toBe(true)
    expect(resolve({ registryUrls: ['https://evil.example/'] }).reasonCode).toBe(
      'DEPENDENCY_REGISTRY_NOT_ALLOWED',
    )
    expect(resolve({ registryUrls: ['http://registry.npmjs.org/'] }).reasonCode).toBe(
      'DEPENDENCY_REGISTRY_INVALID',
    )
    expect(resolve({ registryUrls: ['https://127.0.0.1/'] }).reasonCode).toBe(
      'DEPENDENCY_REGISTRY_INVALID',
    )
  })

  it('normalizes registry URLs and rejects credential, query, and fragment variants', () => {
    expect(normalizeRegistryUrl('https://registry.npmjs.org')).toBe('https://registry.npmjs.org/')
    expect(normalizeRegistryUrl('https://registry.npmjs.org/private')).toBe(
      'https://registry.npmjs.org/private/',
    )
    // secretlint-disable-next-line
    expect(() => normalizeRegistryUrl('https://user:secret@registry.npmjs.org/')).toThrow(
      /credentials/,
    )
    expect(() => normalizeRegistryUrl('https://registry.npmjs.org/?token=secret')).toThrow(
      /query strings or fragments/,
    )
    expect(() => normalizeRegistryUrl('https://registry.npmjs.org/#fragment')).toThrow(
      /query strings or fragments/,
    )
  })

  it('evaluates registry package URLs across invalid, origin, and path boundaries', () => {
    const allowed = ['https://registry.npmjs.org/private/']

    expect(isUrlAllowedByRegistryPolicy('not a URL', allowed)).toBe(false)
    expect(isUrlAllowedByRegistryPolicy('http://registry.npmjs.org/private/pkg.tgz', allowed)).toBe(
      false,
    )
    expect(isUrlAllowedByRegistryPolicy('https://127.0.0.1/private/pkg.tgz', allowed)).toBe(false)
    expect(
      isUrlAllowedByRegistryPolicy(
        // secretlint-disable-next-line
        'https://user:secret@registry.npmjs.org/private/pkg.tgz',
        allowed,
      ),
    ).toBe(false)
    expect(isUrlAllowedByRegistryPolicy('https://evil.example/private/pkg.tgz', allowed)).toBe(
      false,
    )
    expect(isUrlAllowedByRegistryPolicy('https://registry.npmjs.org/public/pkg.tgz', allowed)).toBe(
      false,
    )
    expect(isUrlAllowedByRegistryPolicy('https://registry.npmjs.org/private/', allowed)).toBe(true)
    expect(
      isUrlAllowedByRegistryPolicy('https://registry.npmjs.org/private/pkg.tgz', allowed),
    ).toBe(true)
  })

  it('validates operator policy profile identity, version, namespace, and registries', () => {
    expect(() => new DependencyPolicyCatalog([{ ...PROFILE, id: ' ' }])).toThrow(/id/)
    expect(() => new DependencyPolicyCatalog([{ ...PROFILE, version: 0 }])).toThrow(/version/)
    expect(() => new DependencyPolicyCatalog([{ ...PROFILE, cacheNamespace: ' ' }])).toThrow(
      /namespace/,
    )
    expect(
      () =>
        new DependencyPolicyCatalog([
          { ...PROFILE, allowedRegistries: ['https://registry.npmjs.org/?token=secret'] },
        ]),
    ).toThrow(/query strings or fragments/)
  })

  it('honors the independent dependency-acquisition emergency kill switch', () => {
    const decision = resolve({
      env: { SYMBOLWRIGHT_DISABLE_DEPENDENCY_ACQUISITION: 'true' },
    })

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'DEPENDENCY_ACQUISITION_GLOBALLY_DISABLED',
    })
  })
})
