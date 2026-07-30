import { describe, expect, it } from 'vitest'

import { SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY } from '../access/sandbox-capabilities.js'
import {
  bindDependencyApproval,
  buildDependencyAuthorization,
  dependencyAuthorizationMetadata,
} from './dependency-acquisition-authority.js'

describe('dependency acquisition authority', () => {
  it('binds operator approval to every active policy source', () => {
    const authorization = buildDependencyAuthorization({
      policyReference: { id: 'npm-controlled', version: 7 },
      deploymentMode: 'local',
      callerKind: 'operator',
      runtimeMode: 'APPROVED_EXECUTION',
      repositoryId: 'owner/repo',
      workspaceId: 'mission-1',
      missionId: 'mission-1',
      capabilityApproved: true,
      operatorApproved: true,
      env: { SYMBOLWRIGHT_DEPENDENCY_GLOBAL_POLICY_VERSION: '3' },
    })

    expect(authorization.approvedCapabilityIds).toEqual([SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY])
    expect(authorization.expectedPolicyVersions).toEqual({
      'dependency-global': 3,
      'npm-controlled': 7,
      'mission:mission-1': 1,
      'dependency-request-tightening': 1,
    })
    expect(authorization.approval?.policyVersions).toEqual(
      authorization.expectedPolicyVersions,
    )
  })

  it('binds a consumed delegated approval receipt without allowing caller policy input', () => {
    const authorization = buildDependencyAuthorization({
      policyReference: { id: 'npm-delegated', version: 2 },
      deploymentMode: 'hosted',
      callerKind: 'delegated-grant',
      runtimeMode: 'APPROVED_EXECUTION',
      repositoryId: 'owner/repo',
      workspaceId: 'mission-2',
      missionId: 'mission-2',
      principalId: 'principal-1',
      grantId: 'grant-1',
      grantVersion: 5,
      capabilityApproved: true,
    })
    const bound = bindDependencyApproval(authorization, {
      approvalId: 'approval-1',
      grantVersion: 5,
    })

    expect(bound.approval).toEqual({
      id: 'approval-1',
      capabilityId: SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
      grantVersion: 5,
      policyVersions: authorization.expectedPolicyVersions,
    })
    expect(dependencyAuthorizationMetadata(bound, { maxPackages: 5 })).toEqual({
      maxPackages: 5,
      missionId: 'mission-2',
      sandboxPolicyVersions: authorization.expectedPolicyVersions,
    })
  })
})
