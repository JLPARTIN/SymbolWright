import { describe, expect, it, vi } from 'vitest'

import { SANDBOX_OFFLINE_EXECUTE_CAPABILITY } from '../access/sandbox-capabilities.js'
import type { AccessRuntime } from '../access/access-runtime.js'
import type { SymbolWrightMission } from '../mission/mission-types.js'
import { resolveMissionSandboxCommandAuthority } from './mission-sandbox-command-authority.js'

function mission(overrides: Partial<SymbolWrightMission> = {}): SymbolWrightMission {
  return {
    id: 'mission-1',
    objective: 'Validate repository',
    repository: {
      rootPath: '/srv/repositories/repository-1',
    },
    agent: {
      runtimeMode: 'APPROVED_EXECUTION',
    },
    ...overrides,
  } as SymbolWrightMission
}

describe('mission sandbox command authority', () => {
  it('derives trusted-system authority for a local mission without a delegated grant', () => {
    const result = resolveMissionSandboxCommandAuthority({
      mission: mission(),
      env: {},
    })

    expect(result).toEqual({
      workspaceTrust: 'trusted-local',
      authorization: {
        deploymentMode: 'local',
        callerKind: 'system',
        runtimeMode: 'APPROVED_EXECUTION',
        approvedCapabilityIds: [SANDBOX_OFFLINE_EXECUTE_CAPABILITY],
        repositoryId: '/srv/repositories/repository-1',
        workspaceId: 'mission-1',
        missionId: 'mission-1',
        intent: 'offline-execution',
      },
    })
  })

  it('preserves exact delegated grant capability, command, version, principal, and policy authority', () => {
    const getGrant = vi.fn(() => ({
      version: 7,
      principalId: 'principal-1',
      symbolWrightCapabilities: [SANDBOX_OFFLINE_EXECUTE_CAPABILITY],
      sandboxPolicyReferences: ['policy-1'],
      executionLimits: {
        allowedCommands: ['npm run test'],
      },
    }))
    const accessRuntime = { grantService: { getGrant } } as unknown as AccessRuntime

    const result = resolveMissionSandboxCommandAuthority({
      mission: mission({ grantId: 'grant-1' }),
      accessRuntime,
      env: {},
    })

    expect(getGrant).toHaveBeenCalledWith('grant-1')
    expect(result).toEqual({
      workspaceTrust: 'external-untrusted',
      authorization: {
        deploymentMode: 'local',
        callerKind: 'delegated-grant',
        runtimeMode: 'APPROVED_EXECUTION',
        approvedCapabilityIds: [SANDBOX_OFFLINE_EXECUTE_CAPABILITY],
        repositoryId: '/srv/repositories/repository-1',
        workspaceId: 'mission-1',
        missionId: 'mission-1',
        intent: 'offline-execution',
        grantId: 'grant-1',
        grantVersion: 7,
        principalId: 'principal-1',
        grantAllowedCommands: ['npm run test'],
        grantPolicyReferences: ['policy-1'],
      },
    })
  })

  it('fails closed when a mission names a grant that cannot be resolved', () => {
    const accessRuntime = {
      grantService: { getGrant: vi.fn(() => undefined) },
    } as unknown as AccessRuntime

    const result = resolveMissionSandboxCommandAuthority({
      mission: mission({ grantId: 'missing-grant' }),
      accessRuntime,
      env: {},
    })

    expect(result.workspaceTrust).toBe('external-untrusted')
    expect(result.authorization).toMatchObject({
      callerKind: 'delegated-grant',
      grantId: 'missing-grant',
      approvedCapabilityIds: [],
    })
    expect(result.authorization).not.toHaveProperty('grantVersion')
    expect(result.authorization).not.toHaveProperty('grantAllowedCommands')
  })

  it('derives hosted deployment from server environment rather than mission input', () => {
    const result = resolveMissionSandboxCommandAuthority({
      mission: mission(),
      env: { SYMBOLWRIGHT_DEPLOYMENT_MODE: 'hosted' },
    })

    expect(result.authorization.deploymentMode).toBe('hosted')
  })
})
