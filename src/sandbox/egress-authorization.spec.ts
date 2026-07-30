import { describe, expect, it } from 'vitest'

import {
  bindEgressApproval,
  buildEgressAuthorization,
  egressAuthorizationMetadata,
} from './egress-authorization.js'

describe('egress authorization', () => {
  it('binds policy versions and redacts request metadata', () => {
    const authorization = buildEgressAuthorization({
      policyReference: { id: 'docs-only', version: 2 },
      deploymentMode: 'local',
      callerKind: 'delegated-grant',
      runtimeMode: 'APPROVED_EXECUTION',
      repositoryId: 'owner/repo',
      workspaceId: 'mission-1',
      missionId: 'mission-1',
      grantId: 'grant-1',
      grantVersion: 3,
      capabilityApproved: true,
      env: { SYMBOLWRIGHT_EGRESS_GLOBAL_POLICY_VERSION: '4' },
    })
    const metadata = egressAuthorizationMetadata(authorization, {
      url: 'https://docs.example.com/private?q=secret',
      method: 'get',
      body: 'must-not-leak',
      headers: { authorization: 'must-not-leak' },
    })
    expect(metadata).toMatchObject({
      destinationHostname: 'docs.example.com',
      method: 'GET',
      missionId: 'mission-1',
      sandboxPolicyVersions: {
        'egress-global': 4,
        'docs-only': 2,
        'grant:grant-1': 3,
        'mission:mission-1': 1,
      },
    })
    expect(metadata).not.toHaveProperty('body')
    expect(metadata).not.toHaveProperty('headers')
    expect(
      bindEgressApproval(authorization, { approvalId: 'approval-1', grantVersion: 3 }).approval,
    ).toMatchObject({ id: 'approval-1', capabilityId: 'symbolwright.sandbox.egress' })
  })
})
