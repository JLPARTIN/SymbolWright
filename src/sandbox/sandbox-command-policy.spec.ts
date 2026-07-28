import { describe, expect, it } from 'vitest'

import {
  LEGACY_SANDBOX_EXECUTE_CAPABILITY,
  SANDBOX_OFFLINE_EXECUTE_CAPABILITY,
} from '../access/sandbox-capabilities.js'
import type { SandboxAuthorizationContext } from './sandbox-policy-model.js'
import {
  getSandboxCommandProfile,
  listSandboxCommandProfiles,
  parseSandboxCommand,
  resolveEffectiveSandboxCommandPolicy,
  type SandboxCommandPolicyRequest,
  type SandboxCommandProfileId,
} from './sandbox-command-policy.js'

const REQUEST: SandboxCommandPolicyRequest = {
  command: 'npm run test',
  workspaceRoot: '/workspace/repository',
  workspaceTrust: 'trusted-local',
  profileId: 'trusted-local-runtime-node',
}

function authorization(
  overrides: Partial<SandboxAuthorizationContext> = {},
): SandboxAuthorizationContext {
  return {
    deploymentMode: 'local',
    callerKind: 'operator',
    runtimeMode: 'APPROVED_EXECUTION',
    approvedCapabilityIds: [SANDBOX_OFFLINE_EXECUTE_CAPABILITY],
    repositoryId: 'repository-1',
    workspaceId: 'workspace-1',
    intent: 'offline-execution',
    ...overrides,
  }
}

describe('sandbox command policy', () => {
  it('parses parameterized commands without invoking a shell', () => {
    expect(parseSandboxCommand(' npm run test ')).toEqual({
      binary: 'npm',
      args: ['run', 'test'],
      rendered: 'npm run test',
    })
    expect(() => parseSandboxCommand('npm test && curl example.com')).toThrow(
      'shell metacharacters',
    )
    expect(() => parseSandboxCommand('   ')).toThrow('must not be empty')
  })

  it('exposes only the fixed server-owned command profile catalog', () => {
    const profiles = listSandboxCommandProfiles()

    expect(profiles.length).toBeGreaterThan(1)
    expect(getSandboxCommandProfile('trusted-local-portable-python')?.image).toBe(
      'python:3.12-bookworm',
    )
    expect(getSandboxCommandProfile('missing-profile' as SandboxCommandProfileId)).toBeUndefined()
  })

  it('resolves a fingerprinted local-only compatibility policy', () => {
    const decision = resolveEffectiveSandboxCommandPolicy({
      request: REQUEST,
      authorization: authorization(),
      now: () => new Date('2026-07-28T00:00:00.000Z'),
      env: {},
    })

    expect(decision.allowed).toBe(true)
    expect(decision.policy?.executionClass).toBe('trusted-local-container-compatibility')
    expect(decision.policy?.workspace.mode).toBe('trusted-local-bind')
    expect(decision.policy?.network.mode).toBe('disabled')
    expect(decision.policy?.controls).toEqual({
      shell: false,
      readWriteRepositoryBind: true,
      hostFallback: false,
      dependencyAcquisition: false,
      egress: false,
    })
    expect(decision.policy?.fingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it('permits the trusted-system caller and canonicalizes the legacy offline alias', () => {
    const decision = resolveEffectiveSandboxCommandPolicy({
      request: REQUEST,
      authorization: authorization({
        callerKind: 'system',
        approvedCapabilityIds: [LEGACY_SANDBOX_EXECUTE_CAPABILITY],
      }),
      env: {},
    })

    expect(decision.allowed).toBe(true)
    expect(decision.policy?.callerKind).toBe('system')
    expect(decision.policy?.capabilityId).toBe(SANDBOX_OFFLINE_EXECUTE_CAPABILITY)
  })

  it.each([
    ['hosted deployment', authorization({ deploymentMode: 'hosted' })],
    ['delegated grant', authorization({ callerKind: 'delegated-grant' })],
    ['team member', authorization({ callerKind: 'team-member' })],
  ])('blocks %s from the trusted-local bind path', (_label, context) => {
    const decision = resolveEffectiveSandboxCommandPolicy({
      request: REQUEST,
      authorization: context,
      env: {},
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toMatch(/forbidden|restricted/i)
  })

  it('blocks external-untrusted repositories even for a local operator', () => {
    const decision = resolveEffectiveSandboxCommandPolicy({
      request: { ...REQUEST, workspaceTrust: 'external-untrusted' },
      authorization: authorization(),
      env: {},
    })

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'TRUSTED_LOCAL_CONTAINER_WORKSPACE_FORBIDDEN',
    })
  })

  it('requires the offline capability and approved execution mode', () => {
    const missingCapability = resolveEffectiveSandboxCommandPolicy({
      request: REQUEST,
      authorization: authorization({ approvedCapabilityIds: [] }),
      env: {},
    })
    const readOnly = resolveEffectiveSandboxCommandPolicy({
      request: REQUEST,
      authorization: authorization({ runtimeMode: 'READ_ONLY' }),
      env: {},
    })

    expect(missingCapability.reasonCode).toBe('SANDBOX_CAPABILITY_NOT_APPROVED')
    expect(readOnly.reasonCode).toBe('SANDBOX_RUNTIME_MODE_BLOCKED')
  })

  it('rejects malformed commands and unknown command profiles before execution', () => {
    const malformed = resolveEffectiveSandboxCommandPolicy({
      request: { ...REQUEST, command: 'npm test | cat' },
      authorization: authorization(),
      env: {},
    })
    const missingProfile = resolveEffectiveSandboxCommandPolicy({
      request: { ...REQUEST, profileId: 'missing-profile' as SandboxCommandProfileId },
      authorization: authorization(),
      env: {},
    })

    expect(malformed).toMatchObject({
      allowed: false,
      reasonCode: 'SANDBOX_COMMAND_INVALID',
    })
    expect(missingProfile).toMatchObject({
      allowed: false,
      reasonCode: 'SANDBOX_COMMAND_PROFILE_NOT_FOUND',
    })
  })

  it('enforces profile binaries and exact grant command restrictions', () => {
    const unsupportedBinary = resolveEffectiveSandboxCommandPolicy({
      request: { ...REQUEST, command: 'python script.py' },
      authorization: authorization(),
      env: {},
    })
    const notGranted = resolveEffectiveSandboxCommandPolicy({
      request: REQUEST,
      authorization: authorization({ grantAllowedCommands: ['npm run lint'] }),
      env: {},
    })
    const granted = resolveEffectiveSandboxCommandPolicy({
      request: REQUEST,
      authorization: authorization({ grantAllowedCommands: ['npm run test'] }),
      env: {},
    })

    expect(unsupportedBinary.reasonCode).toBe('SANDBOX_COMMAND_BINARY_NOT_ALLOWED')
    expect(notGranted.reasonCode).toBe('SANDBOX_COMMAND_NOT_GRANTED')
    expect(granted.allowed).toBe(true)
  })

  it('intersects request, mission, grant, profile, and global limits by minimum', () => {
    const decision = resolveEffectiveSandboxCommandPolicy({
      request: { ...REQUEST, timeoutMs: 40_000, maxOutputBytes: 8_000 },
      authorization: authorization({
        grantLimits: { timeoutMs: 30_000, maxOutputBytes: 7_000 },
        missionLimits: { timeoutMs: 20_000, maxOutputBytes: 6_000 },
      }),
      env: {},
    })

    expect(decision.policy?.limits).toEqual({ timeoutMs: 20_000, maxOutputBytes: 6_000 })
  })

  it('ignores non-positive and non-finite optional limit requests', () => {
    const decision = resolveEffectiveSandboxCommandPolicy({
      request: { ...REQUEST, timeoutMs: 0, maxOutputBytes: Number.NaN },
      authorization: authorization({
        grantLimits: { timeoutMs: -1, maxOutputBytes: Number.POSITIVE_INFINITY },
        missionLimits: {},
      }),
      env: {},
    })

    expect(decision.allowed).toBe(true)
    expect(decision.policy?.limits).toEqual({
      timeoutMs: 60_000,
      maxOutputBytes: 64_000,
    })
  })

  it('honors the emergency global kill switch', () => {
    const decision = resolveEffectiveSandboxCommandPolicy({
      request: REQUEST,
      authorization: authorization(),
      env: { SYMBOLWRIGHT_DISABLE_SANDBOX_EXECUTION: 'true' },
    })

    expect(decision.reasonCode).toBe('SANDBOX_GLOBALLY_DISABLED')
  })
})
