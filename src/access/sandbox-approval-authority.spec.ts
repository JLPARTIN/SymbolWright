import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AccessGrantService } from './access-grant-service.js'
import { AccessStore } from './access-store.js'
import { AuthorizationService } from './authorization-service.js'
import {
  LEGACY_SANDBOX_EXECUTE_CAPABILITY,
  SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
  SANDBOX_OFFLINE_EXECUTE_CAPABILITY,
} from './sandbox-capabilities.js'

const REPOSITORY = 'JLPARTIN/SymbolWright'
const POLICY_VERSIONS = {
  'sandbox-global': 1,
  'npm-acquisition': 2,
  'runner:container-javascript': 1,
  'request-tightening': 1,
} as const

describe('sandbox approval authority binding', () => {
  let root: string
  let store: AccessStore
  let grants: AccessGrantService
  let authorization: AuthorizationService

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'symbolwright-sandbox-approval-'))
    store = new AccessStore({ workspaceRoot: root })
    grants = new AccessGrantService(store)
    authorization = new AuthorizationService(store)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  function createDependencyGrant() {
    return grants.createGrant({
      principalType: 'coding-agent',
      displayName: 'Dependency acquisition agent',
      issuedBy: 'operator-1',
      profileId: 'custom',
      repositoryScope: {
        mode: 'single',
        repositories: [REPOSITORY],
        organizations: [],
      },
      additionalSymbolWrightCapabilities: [SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY],
      explicitHighRiskCapabilities: [SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY],
      stepUpConfirmed: true,
      reason: 'Acquire lockfile-pinned dependencies through the governed broker.',
      sandboxPolicyReferences: {
        dependency: { id: 'npm-acquisition', version: 2 },
      },
      approvalPolicy: {
        rules: [
          {
            match: SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
            requirement: 'every-high-risk-operation',
          },
          { match: '*', requirement: 'none' },
        ],
      },
    }).grant
  }

  function requestFor(
    grant: ReturnType<typeof createDependencyGrant>,
    missionId: string,
    sandboxPolicyVersions: unknown,
  ) {
    return {
      principalId: grant.principalId,
      grantId: grant.id,
      capability: SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
      repository: REPOSITORY,
      missionId,
      metadata: { sandboxPolicyVersions },
    }
  }

  it('binds an approval to the current grant and sorted policy-version snapshot', async () => {
    const grant = createDependencyGrant()
    expect(grant.sandboxPolicyReferences?.dependency).toEqual({
      id: 'npm-acquisition',
      version: 2,
    })
    const versions = {
      ...POLICY_VERSIONS,
      [`grant:${grant.id}`]: grant.version,
    }
    const first = await authorization.evaluate(requestFor(grant, 'mission-1', versions))

    expect(first.allowed).toBe(false)
    expect(first.requiresApproval).toBe(true)
    const approval = store.readApproval(first.approvalId as string)
    expect(approval).toMatchObject({
      capability: SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
      grantVersion: grant.version,
      policyVersions: versions,
    })

    store.writeApproval({
      ...approval!,
      status: 'approved',
      approverId: 'operator-1',
    })
    const reorderedVersions = Object.fromEntries(Object.entries(versions).reverse())
    const approved = await authorization.evaluate(requestFor(grant, 'mission-1', reorderedVersions))
    expect(approved.allowed).toBe(true)
  })

  it('does not reuse an approval after the grant version changes', async () => {
    const grant = createDependencyGrant()
    const versions = {
      ...POLICY_VERSIONS,
      [`grant:${grant.id}`]: grant.version,
    }
    const first = await authorization.evaluate(requestFor(grant, 'mission-2', versions))
    const approval = store.readApproval(first.approvalId as string)
    store.writeApproval({
      ...approval!,
      status: 'approved',
      approverId: 'operator-1',
    })
    store.writeGrant({ ...grant, version: grant.version + 1 })

    const afterGrantUpdate = await authorization.evaluate(
      requestFor({ ...grant, version: grant.version + 1 }, 'mission-2', versions),
    )
    expect(afterGrantUpdate.allowed).toBe(false)
    expect(afterGrantUpdate.requiresApproval).toBe(true)
    expect(afterGrantUpdate.approvalId).not.toBe(first.approvalId)
  })

  it('does not reuse an approval with a stale or incomplete policy binding', async () => {
    const grant = createDependencyGrant()
    const versions = {
      ...POLICY_VERSIONS,
      [`grant:${grant.id}`]: grant.version,
    }
    const first = await authorization.evaluate(requestFor(grant, 'mission-3', versions))
    const approval = store.readApproval(first.approvalId as string)
    store.writeApproval({
      ...approval!,
      status: 'approved',
      approverId: 'operator-1',
      policyVersions: {
        ...approval!.policyVersions,
        'sandbox-global': 99,
      },
    })

    const stale = await authorization.evaluate(requestFor(grant, 'mission-3', versions))
    expect(stale.allowed).toBe(false)
    expect(stale.requiresApproval).toBe(true)
    expect(stale.approvalId).not.toBe(first.approvalId)
  })

  it('fails malformed policy metadata closed to an unbound approval snapshot', async () => {
    const grant = createDependencyGrant()
    for (const [index, malformed] of [
      null,
      [],
      { '': 1 },
      { policy: '1' },
      { policy: 0 },
      { policy: Number.MAX_SAFE_INTEGER + 1 },
    ].entries()) {
      const missionId = `malformed-${index}`
      const first = await authorization.evaluate(requestFor(grant, missionId, malformed))
      const approval = store.readApproval(first.approvalId as string)
      expect(approval?.policyVersions).toBeUndefined()
      store.writeApproval({
        ...approval!,
        status: 'approved',
        approverId: 'operator-1',
      })
      const second = await authorization.evaluate(requestFor(grant, missionId, malformed))
      expect(second.allowed).toBe(true)
    }
  })

  it('treats the legacy execute capability as an offline-only alias', async () => {
    const grant = grants.createGrant({
      principalType: 'coding-agent',
      displayName: 'Offline sandbox agent',
      issuedBy: 'operator-1',
      profileId: 'custom',
      repositoryScope: {
        mode: 'single',
        repositories: [REPOSITORY],
        organizations: [],
      },
      additionalSymbolWrightCapabilities: [SANDBOX_OFFLINE_EXECUTE_CAPABILITY],
      approvalPolicy: { rules: [{ match: '*', requirement: 'none' }] },
    }).grant

    const legacyRequest = await authorization.evaluate({
      principalId: grant.principalId,
      grantId: grant.id,
      capability: LEGACY_SANDBOX_EXECUTE_CAPABILITY,
      repository: REPOSITORY,
    })
    expect(legacyRequest.allowed).toBe(true)
    expect(legacyRequest.riskLevel).toBe('low')
  })
})
