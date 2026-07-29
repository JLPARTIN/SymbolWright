import { describe, expect, it } from 'vitest'

import { SANDBOX_EGRESS_CAPABILITY } from '../access/sandbox-capabilities.js'
import type { SandboxAuthorizationContext } from './sandbox-policy-model.js'
import type { EgressPolicyError } from './egress-policy.js'
import {
  DEFAULT_EGRESS_POLICY_LIMITS,
  EGRESS_GLOBAL_POLICY_ID,
  EgressPolicyCatalog,
  authorizeEgressRequest,
  describeEgressRuntimeState,
  isHostAllowedByEgressPolicy,
  normalizeEgressUrl,
  resolveEffectiveEgressPolicy,
  type EgressPolicyProfile,
} from './egress-policy.js'

const PROFILE: EgressPolicyProfile = {
  id: 'runtime-api',
  version: 3,
  enabled: true,
  deploymentModes: ['local', 'hosted'],
  callerKinds: ['operator', 'delegated-grant', 'system'],
  allowedHosts: ['api.example.com', '*.services.example.com'],
  allowedMethods: ['GET', 'HEAD', 'POST'],
  allowedRequestHeaders: ['accept', 'content-type', 'x-request-id'],
  allowedPorts: [443],
  redirectPolicy: 'allowlisted',
  credentialPolicy: 'none',
  requireTls: true,
  auditRetentionDays: 30,
  limits: DEFAULT_EGRESS_POLICY_LIMITS,
}

function authorization(
  overrides: Partial<SandboxAuthorizationContext> = {},
): SandboxAuthorizationContext {
  return {
    deploymentMode: 'hosted',
    callerKind: 'delegated-grant',
    runtimeMode: 'APPROVED_EXECUTION',
    approvedCapabilityIds: [SANDBOX_EGRESS_CAPABILITY],
    repositoryId: 'repository-1',
    workspaceId: 'workspace-1',
    missionId: 'mission-1',
    grantId: 'grant-1',
    grantVersion: 7,
    policyReference: { id: PROFILE.id, version: PROFILE.version },
    approval: {
      id: 'approval-1',
      capabilityId: SANDBOX_EGRESS_CAPABILITY,
      grantVersion: 7,
      policyVersions: {
        [EGRESS_GLOBAL_POLICY_ID]: 1,
        [PROFILE.id]: PROFILE.version,
        'grant:grant-1': 7,
        'mission:mission-1': 1,
        'egress-request-tightening': 1,
      },
    },
    ...overrides,
  }
}

function resolve(
  overrides: {
    readonly authorization?: SandboxAuthorizationContext
    readonly catalog?: EgressPolicyCatalog
    readonly env?: NodeJS.ProcessEnv
    readonly limits?: { readonly maxRequests?: number; readonly timeoutMs?: number }
  } = {},
) {
  return resolveEffectiveEgressPolicy({
    request: overrides.limits === undefined ? {} : { limits: overrides.limits },
    authorization: overrides.authorization ?? authorization(),
    catalog: overrides.catalog ?? new EgressPolicyCatalog([PROFILE]),
    env: overrides.env ?? {},
    now: () => new Date('2026-07-29T00:00:00.000Z'),
  })
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

describe('brokered egress policy', () => {
  it('resolves an immutable approval-bound allowlisted profile', () => {
    const decision = resolve()

    expect(decision).toMatchObject({
      allowed: true,
      reasonCode: 'EGRESS_POLICY_ALLOWED',
      state: 'allowlisted',
    })
    expect(decision.policy).toMatchObject({
      policyId: PROFILE.id,
      policyVersion: PROFILE.version,
      capabilityId: SANDBOX_EGRESS_CAPABILITY,
      allowedHosts: ['*.services.example.com', 'api.example.com'],
      allowedPorts: [443],
      credentialPolicy: 'none',
      requireTls: true,
    })
    expect(decision.policy?.fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(Object.isFrozen(decision.policy)).toBe(true)
    expect(Object.isFrozen(decision.policy?.limits)).toBe(true)
    expect(Object.isFrozen(decision.policy?.sources)).toBe(true)
  })

  it('requires the explicit capability and approved runtime mode', () => {
    expect(
      resolve({ authorization: authorization({ approvedCapabilityIds: [] }) }).reasonCode,
    ).toBe('EGRESS_CAPABILITY_NOT_APPROVED')
    expect(resolve({ authorization: authorization({ runtimeMode: 'READ_ONLY' }) }).reasonCode).toBe(
      'EGRESS_RUNTIME_MODE_BLOCKED',
    )
  })

  it('requires a current installed and enabled profile reference', () => {
    expect(resolve({ authorization: withoutPolicyReference(authorization()) }).reasonCode).toBe(
      'EGRESS_POLICY_REFERENCE_REQUIRED',
    )
    expect(resolve({ catalog: new EgressPolicyCatalog() }).reasonCode).toBe(
      'EGRESS_POLICY_NOT_FOUND',
    )

    const stale = resolve({
      authorization: authorization({
        policyReference: { id: PROFILE.id, version: PROFILE.version - 1 },
      }),
      catalog: new EgressPolicyCatalog([PROFILE, { ...PROFILE, version: PROFILE.version - 1 }]),
    })
    expect(stale.reasonCode).toBe('EGRESS_POLICY_VERSION_STALE')

    expect(
      resolve({
        catalog: new EgressPolicyCatalog([{ ...PROFILE, enabled: false }]),
      }).reasonCode,
    ).toBe('EGRESS_POLICY_DISABLED')
    expect(
      resolve({
        catalog: new EgressPolicyCatalog([{ ...PROFILE, emergencyDisabled: true }]),
      }).reasonCode,
    ).toBe('EGRESS_PROFILE_EMERGENCY_DISABLED')
  })

  it('enforces deployment and caller scope', () => {
    expect(
      resolve({
        catalog: new EgressPolicyCatalog([{ ...PROFILE, deploymentModes: ['local'] }]),
      }).reasonCode,
    ).toBe('EGRESS_DEPLOYMENT_NOT_ALLOWED')
    expect(
      resolve({
        authorization: authorization({ callerKind: 'team-member' }),
      }).reasonCode,
    ).toBe('EGRESS_CALLER_NOT_ALLOWED')
  })

  it('requires approval bound to capability, grant, and every policy source', () => {
    expect(resolve({ authorization: withoutApproval(authorization()) }).reasonCode).toBe(
      'EGRESS_APPROVAL_REQUIRED',
    )
    expect(
      resolve({
        authorization: authorization({
          approval: {
            id: 'wrong-capability',
            capabilityId: 'symbolwright.sandbox.execute.offline',
            grantVersion: 7,
            policyVersions: {},
          },
        }),
      }).reasonCode,
    ).toBe('EGRESS_APPROVAL_CAPABILITY_MISMATCH')
    expect(
      resolve({
        authorization: authorization({
          approval: {
            ...authorization().approval!,
            grantVersion: 6,
          },
        }),
      }).reasonCode,
    ).toBe('EGRESS_APPROVAL_GRANT_STALE')
    expect(
      resolve({
        authorization: authorization({
          approval: {
            ...authorization().approval!,
            policyVersions: { [EGRESS_GLOBAL_POLICY_ID]: 1 },
          },
        }),
      }).reasonCode,
    ).toBe('EGRESS_APPROVAL_POLICY_INCOMPLETE')
    expect(
      resolve({
        authorization: authorization({
          approval: {
            ...authorization().approval!,
            policyVersions: {
              ...authorization().approval!.policyVersions,
              [PROFILE.id]: PROFILE.version - 1,
            },
          },
        }),
      }).reasonCode,
    ).toBe('EGRESS_APPROVAL_POLICY_STALE')
  })

  it('honors global revision binding and the emergency kill switch', () => {
    expect(resolve({ env: { SYMBOLWRIGHT_DISABLE_SANDBOX_EGRESS: 'true' } })).toMatchObject({
      allowed: false,
      reasonCode: 'EGRESS_GLOBALLY_DISABLED',
      state: 'disabled',
    })
    expect(resolve({ env: { SYMBOLWRIGHT_EGRESS_GLOBAL_POLICY_VERSION: '2' } }).reasonCode).toBe(
      'EGRESS_APPROVAL_POLICY_STALE',
    )
    expect(resolve({ env: { SYMBOLWRIGHT_EGRESS_GLOBAL_POLICY_VERSION: 'invalid' } }).allowed).toBe(
      true,
    )
  })

  it('allows request limits only to tighten the operator profile', () => {
    const tightened = resolve({ limits: { maxRequests: 2, timeoutMs: 5_000 } })
    const widening = resolve({
      limits: {
        maxRequests: PROFILE.limits.maxRequests * 2,
        timeoutMs: PROFILE.limits.timeoutMs * 2,
      },
    })
    const invalid = resolve({ limits: { maxRequests: -1, timeoutMs: Number.NaN } })

    expect(tightened.policy?.limits.maxRequests).toBe(2)
    expect(tightened.policy?.limits.timeoutMs).toBe(5_000)
    expect(widening.policy?.limits.maxRequests).toBe(PROFILE.limits.maxRequests)
    expect(widening.policy?.limits.timeoutMs).toBe(PROFILE.limits.timeoutMs)
    expect(invalid.policy?.limits.maxRequests).toBe(PROFILE.limits.maxRequests)
  })

  it('authorizes only exact or wildcard-subdomain HTTPS destinations', () => {
    const policy = resolve().policy!

    expect(
      authorizeEgressRequest(policy, {
        url: 'https://api.example.com/v1/items#fragment',
        headers: { Accept: 'application/json', 'X-Request-Id': 'request-1' },
      }),
    ).toMatchObject({ method: 'GET', bodyBytes: 0 })
    expect(
      authorizeEgressRequest(policy, {
        url: 'https://worker.services.example.com/v1',
        method: 'post',
        headers: { 'content-type': 'application/json' },
        bodyBytes: 100,
      }),
    ).toMatchObject({ method: 'POST', bodyBytes: 100 })

    expect(isHostAllowedByEgressPolicy('api.example.com', policy.allowedHosts)).toBe(true)
    expect(isHostAllowedByEgressPolicy('worker.services.example.com', policy.allowedHosts)).toBe(
      true,
    )
    expect(isHostAllowedByEgressPolicy('services.example.com', policy.allowedHosts)).toBe(false)
    expect(isHostAllowedByEgressPolicy('evil-example.com', policy.allowedHosts)).toBe(false)
  })

  it.each([
    ['http://api.example.com/v1', 'EGRESS_SCHEME_NOT_ALLOWED'],
    ['https://user:secret@api.example.com/v1', 'EGRESS_CREDENTIALS_FORBIDDEN'],
    ['https://127.0.0.1/v1', 'EGRESS_DIRECT_IP_FORBIDDEN'],
    ['https://2130706433/v1', 'EGRESS_DIRECT_IP_FORBIDDEN'],
    ['https://api.example.com:8443/v1', 'EGRESS_PORT_NOT_ALLOWED'],
    ['not a url', 'EGRESS_URL_INVALID'],
  ])('rejects unsafe URL %s', (url, code) => {
    expect(() => normalizeEgressUrl(url)).toThrowError(
      expect.objectContaining({ code }) as EgressPolicyError,
    )
  })

  it('rejects destinations, methods, headers, and request bodies outside policy', () => {
    const policy = resolve().policy!

    expect(() => authorizeEgressRequest(policy, { url: 'https://evil.example/v1' })).toThrowError(
      expect.objectContaining({ code: 'EGRESS_DESTINATION_NOT_ALLOWED' }),
    )
    expect(() =>
      authorizeEgressRequest(policy, {
        url: 'https://api.example.com/v1',
        method: 'TRACE',
      }),
    ).toThrowError(expect.objectContaining({ code: 'EGRESS_METHOD_UNSUPPORTED' }))

    const getOnly = resolve({
      catalog: new EgressPolicyCatalog([{ ...PROFILE, allowedMethods: ['GET'] }]),
    }).policy!
    expect(() =>
      authorizeEgressRequest(getOnly, {
        url: 'https://api.example.com/v1',
        method: 'POST',
      }),
    ).toThrowError(expect.objectContaining({ code: 'EGRESS_METHOD_NOT_ALLOWED' }))
    expect(() =>
      authorizeEgressRequest(policy, {
        url: 'https://api.example.com/v1',
        headers: { authorization: 'Bearer secret' },
      }),
    ).toThrowError(expect.objectContaining({ code: 'EGRESS_HEADER_FORBIDDEN' }))
    expect(() =>
      authorizeEgressRequest(policy, {
        url: 'https://api.example.com/v1',
        headers: { 'x-unapproved': 'value' },
      }),
    ).toThrowError(expect.objectContaining({ code: 'EGRESS_HEADER_NOT_ALLOWED' }))
    expect(() =>
      authorizeEgressRequest(policy, {
        url: 'https://api.example.com/v1',
        headers: { 'bad header': 'value' },
      }),
    ).toThrowError(expect.objectContaining({ code: 'EGRESS_HEADER_INVALID' }))
    expect(() =>
      authorizeEgressRequest(policy, {
        url: 'https://api.example.com/v1',
        headers: { accept: 'bad\r\nheader' },
      }),
    ).toThrowError(expect.objectContaining({ code: 'EGRESS_HEADER_INVALID' }))
    expect(() =>
      authorizeEgressRequest(policy, {
        url: 'https://api.example.com/v1',
        bodyBytes: policy.limits.maxRequestBytes + 1,
      }),
    ).toThrowError(expect.objectContaining({ code: 'EGRESS_REQUEST_QUOTA_EXCEEDED' }))
    expect(() =>
      authorizeEgressRequest(policy, {
        url: 'https://api.example.com/v1',
        bodyBytes: -1,
      }),
    ).toThrowError(expect.objectContaining({ code: 'EGRESS_REQUEST_BODY_INVALID' }))
  })

  it('reports explicit operator-visible runtime states', () => {
    expect(
      describeEgressRuntimeState({
        globallyDisabled: true,
        profileCount: 1,
        brokerSupported: true,
      }),
    ).toBe('disabled')
    expect(
      describeEgressRuntimeState({
        globallyDisabled: false,
        profileCount: 1,
        brokerSupported: false,
      }),
    ).toBe('unsupported')
    expect(
      describeEgressRuntimeState({
        globallyDisabled: false,
        profileCount: 1,
        brokerSupported: true,
        quotaExhausted: true,
      }),
    ).toBe('quota-exhausted')
    expect(
      describeEgressRuntimeState({
        globallyDisabled: false,
        profileCount: 1,
        brokerSupported: true,
        denied: true,
      }),
    ).toBe('denied')
    expect(
      describeEgressRuntimeState({
        globallyDisabled: false,
        profileCount: 1,
        brokerSupported: true,
      }),
    ).toBe('allowlisted')
    expect(
      describeEgressRuntimeState({
        globallyDisabled: false,
        profileCount: 0,
        brokerSupported: true,
      }),
    ).toBe('dependency-only')
  })

  it('rejects malformed or overbroad operator profiles', () => {
    expect(() => new EgressPolicyCatalog([{ ...PROFILE, id: '' }])).toThrow(
      'Egress policy id must not be empty.',
    )
    expect(() => new EgressPolicyCatalog([{ ...PROFILE, version: 0 }])).toThrow(
      'Egress policy version must be a positive integer.',
    )
    expect(() => new EgressPolicyCatalog([{ ...PROFILE, allowedHosts: [] }])).toThrow(
      'Egress policy must contain at least one allowed host.',
    )
    expect(() => new EgressPolicyCatalog([{ ...PROFILE, allowedHosts: ['*.localhost'] }])).toThrow(
      'Egress wildcard host is too broad',
    )
    expect(
      () => new EgressPolicyCatalog([{ ...PROFILE, allowedRequestHeaders: ['Authorization'] }]),
    ).toThrow('Forbidden egress request header in profile')
    expect(() => new EgressPolicyCatalog([{ ...PROFILE, allowedPorts: [80] }])).toThrow(
      'supports HTTPS port 443 only',
    )
    expect(() => new EgressPolicyCatalog([{ ...PROFILE, auditRetentionDays: 0 }])).toThrow(
      'Egress audit retention must be a positive integer',
    )
    expect(
      () =>
        new EgressPolicyCatalog([{ ...PROFILE, limits: { ...PROFILE.limits, maxRequests: 0 } }]),
    ).toThrow('Egress policy limit maxRequests must be a positive safe integer.')
  })
})
