import { describe, expect, it } from 'vitest'

import { SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY } from '../access/sandbox-capabilities.js'
import {
  bindDependencyApproval,
  buildDependencyAuthorization,
  dependencyAuthorizationMetadata,
  dependencyPolicyVersions,
} from './dependency-acquisition-authority.js'
import type { SandboxAuthorizationContext } from './sandbox-policy-model.js'

describe('dependency acquisition authority optional branches', () => {
  it('builds a minimal fail-closed authorization without optional caller identity or approval', () => {
    const authorization = buildDependencyAuthorization({
      policyReference: { id: 'npm-minimal', version: 4 },
      deploymentMode: 'local',
      callerKind: 'operator',
      runtimeMode: 'APPROVED_EXECUTION',
      repositoryId: 'owner/repo',
      workspaceId: 'workspace-1',
      capabilityApproved: false,
    })

    expect(authorization.approvedCapabilityIds).toEqual([])
    expect(authorization).not.toHaveProperty('missionId')
    expect(authorization).not.toHaveProperty('principalId')
    expect(authorization).not.toHaveProperty('grantId')
    expect(authorization).not.toHaveProperty('grantVersion')
    expect(authorization).not.toHaveProperty('approval')
    expect(authorization.expectedPolicyVersions).toEqual({
      'dependency-global': 1,
      'npm-minimal': 4,
      'dependency-request-tightening': 1,
    })
  })

  it('defaults an omitted grant version and rejects an invalid environment version through fallback', () => {
    expect(
      dependencyPolicyVersions({
        policyReference: { id: 'npm-grant', version: 2 },
        grantId: 'grant-1',
        env: { SYMBOLWRIGHT_DEPENDENCY_GLOBAL_POLICY_VERSION: 'invalid' },
      }),
    ).toEqual({
      'dependency-global': 1,
      'npm-grant': 2,
      'grant:grant-1': 1,
      'dependency-request-tightening': 1,
    })
  })

  it('returns the original authorization when policy versions or an approval receipt are absent', () => {
    const withoutVersions = {
      deploymentMode: 'local',
      callerKind: 'operator',
      runtimeMode: 'APPROVED_EXECUTION',
      approvedCapabilityIds: [SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY],
      repositoryId: 'owner/repo',
      workspaceId: 'workspace-1',
      policyReference: { id: 'npm-minimal', version: 1 },
      intent: 'dependency-acquisition',
    } as SandboxAuthorizationContext

    expect(
      bindDependencyApproval(withoutVersions, {
        approvalId: 'approval-1',
        grantVersion: 1,
      }),
    ).toBe(withoutVersions)

    const withVersions = buildDependencyAuthorization({
      policyReference: { id: 'npm-minimal', version: 1 },
      deploymentMode: 'local',
      callerKind: 'operator',
      runtimeMode: 'APPROVED_EXECUTION',
      repositoryId: 'owner/repo',
      workspaceId: 'workspace-1',
      capabilityApproved: true,
      env: {},
    })
    expect(bindDependencyApproval(withVersions, { grantVersion: 1 })).toBe(withVersions)
  })

  it('binds an approval without inventing a missing grant version', () => {
    const authorization = buildDependencyAuthorization({
      policyReference: { id: 'npm-minimal', version: 1 },
      deploymentMode: 'local',
      callerKind: 'operator',
      runtimeMode: 'APPROVED_EXECUTION',
      repositoryId: 'owner/repo',
      workspaceId: 'workspace-1',
      capabilityApproved: true,
      env: {},
    })

    const bound = bindDependencyApproval(authorization, {
      approvalId: 'approval-1',
      grantVersion: 1,
    })

    expect(bound.approval).toEqual({
      id: 'approval-1',
      capabilityId: SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
      policyVersions: authorization.expectedPolicyVersions,
    })
  })

  it('emits empty metadata defaults when optional metadata and policy context are absent', () => {
    const authorization = {
      deploymentMode: 'local',
      callerKind: 'operator',
      runtimeMode: 'APPROVED_EXECUTION',
      approvedCapabilityIds: [],
      repositoryId: 'owner/repo',
      workspaceId: 'workspace-1',
      policyReference: { id: 'npm-minimal', version: 1 },
      intent: 'dependency-acquisition',
    } as SandboxAuthorizationContext

    expect(dependencyAuthorizationMetadata(authorization, undefined)).toEqual({
      sandboxPolicyVersions: {},
    })
  })
})
