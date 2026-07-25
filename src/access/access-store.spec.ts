import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AccessStore } from './access-store.js'
import type { AgentAccessGrant, AuditEvent, DeviceAuthorization } from './access-types.js'

let root: string
let store: AccessStore

function fakeGrant(id: string, principalId = 'principal-1'): AgentAccessGrant {
  const now = new Date().toISOString()
  return {
    id,
    version: 1,
    principalId,
    principalType: 'coding-agent',
    displayName: 'Fixture',
    issuedBy: 'operator-1',
    createdAt: now,
    updatedAt: now,
    startsAt: now,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    status: 'active',
    profileId: 'coding-agent',
    repositoryScope: { mode: 'installation', repositories: [], organizations: [] },
    branchScope: {
      allowedPatterns: ['feat/**'],
      deniedPatterns: ['main'],
      defaultBranchReadOnly: true,
      defaultBranchMutationAllowed: false,
    },
    symbolWrightCapabilities: [],
    githubCapabilities: [],
    deniedCapabilities: [],
    approvalPolicy: { rules: [] },
    executionLimits: {},
    sessionLimits: {},
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'symbolwright-access-store-'))
  store = new AccessStore({ workspaceRoot: root })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('AccessStore grants', () => {
  it('writes, reads, lists (newest first), and deletes grants', () => {
    store.writeGrant(fakeGrant('grant-a'))
    store.writeGrant({
      ...fakeGrant('grant-b'),
      createdAt: new Date(Date.now() + 1000).toISOString(),
    })
    expect(store.readGrant('grant-a')?.id).toBe('grant-a')
    expect(store.listGrants().map((g) => g.id)).toEqual(['grant-b', 'grant-a'])
    store.deleteGrant('grant-a')
    expect(store.readGrant('grant-a')).toBeUndefined()
    expect(store.listGrants().map((g) => g.id)).toEqual(['grant-b'])
  })

  it('returns undefined for a grant that was never written', () => {
    expect(store.readGrant('never-existed')).toBeUndefined()
  })

  it('rejects an invalid record id', () => {
    expect(() => store.readGrant('../escape')).toThrow()
    expect(() => store.writeGrant(fakeGrant('bad id with spaces'))).toThrow()
  })

  it('recovers from a corrupt current file using the .previous backup', () => {
    store.writeGrant(fakeGrant('grant-c'))
    store.writeGrant({ ...fakeGrant('grant-c'), displayName: 'Second write' })
    const grantPath = join(root, '.symbolwright', 'access', 'grants', 'grant-c.json')
    writeFileSync(grantPath, '{not valid json')
    const recovered = store.readGrant('grant-c')
    expect(recovered?.displayName).toBe('Fixture')
  })

  it('returns undefined when both the current and .previous files are corrupt', () => {
    store.writeGrant(fakeGrant('grant-d'))
    const grantPath = join(root, '.symbolwright', 'access', 'grants', 'grant-d.json')
    writeFileSync(grantPath, '{not valid json')
    writeFileSync(`${grantPath}.previous`, '{also not valid')
    expect(store.readGrant('grant-d')).toBeUndefined()
  })

  it('skips unreadable entries when listing', () => {
    store.writeGrant(fakeGrant('grant-e'))
    const grantPath = join(root, '.symbolwright', 'access', 'grants', 'grant-f.json')
    writeFileSync(grantPath, '{not valid json')
    expect(store.listGrants().map((g) => g.id)).toEqual(['grant-e'])
  })
})

describe('AccessStore credentials and sessions', () => {
  it('lists credentials/sessions scoped to one grant', () => {
    store.writeCredential({
      id: 'cred-1',
      grantId: 'grant-x',
      saltHex: 'aa',
      hashHex: 'bb',
      metadata: { kind: 'manual-token', tokenPrefix: 'sw_agent_', lastFour: '1234', createdAt: '' },
      revoked: false,
    })
    store.writeCredential({
      id: 'cred-2',
      grantId: 'grant-y',
      saltHex: 'aa',
      hashHex: 'bb',
      metadata: { kind: 'manual-token', tokenPrefix: 'sw_agent_', lastFour: '5678', createdAt: '' },
      revoked: false,
    })
    expect(store.listCredentialsForGrant('grant-x').map((c) => c.id)).toEqual(['cred-1'])

    store.writeSession({
      id: 'session-1',
      grantId: 'grant-x',
      grantVersion: 1,
      principalId: 'p1',
      credentialId: 'cred-1',
      createdAt: '',
      expiresAt: '',
      lastActiveAt: '',
      revoked: false,
    })
    expect(store.listSessionsForGrant('grant-x').map((s) => s.id)).toEqual(['session-1'])
    expect(store.listSessionsForGrant('grant-y')).toEqual([])
  })
})

describe('AccessStore approvals', () => {
  it('lists approvals scoped to one grant', () => {
    store.writeApproval({
      id: 'approval-1',
      grantId: 'grant-x',
      capability: 'repo.pull_request.merge',
      summary: 'merge',
      createdAt: '',
      expiresAt: '',
      status: 'pending',
      boundOperationKey: 'key-1',
    })
    expect(store.readApproval('approval-1')?.id).toBe('approval-1')
    expect(store.listApprovalsForGrant('grant-x')).toHaveLength(1)
    expect(store.listApprovalsForGrant('grant-z')).toEqual([])
  })
})

describe('AccessStore device authorizations', () => {
  function fakeDeviceAuth(deviceCode: string, userCode: string): DeviceAuthorization {
    return {
      deviceCode,
      userCode,
      principalId: 'p1',
      principalType: 'coding-agent',
      displayName: 'x',
      requestedProfileId: 'coding-agent',
      requestedRepositoryScope: { mode: 'installation', repositories: [], organizations: [] },
      createdAt: '',
      expiresAt: '',
      pollIntervalSeconds: 5,
      status: 'pending',
    }
  }

  it('finds a device authorization by device code or user code', () => {
    store.writeDeviceAuthorization(fakeDeviceAuth('device-1', 'AAAA-BBBB'))
    expect(store.readDeviceAuthorizationByDeviceCode('device-1')?.userCode).toBe('AAAA-BBBB')
    expect(store.findDeviceAuthorizationByUserCode('AAAA-BBBB')?.deviceCode).toBe('device-1')
    expect(store.findDeviceAuthorizationByUserCode('NOPE-NOPE')).toBeUndefined()
  })

  it('lists only pending, non-expired device authorizations', () => {
    store.writeDeviceAuthorization(fakeDeviceAuth('device-2', 'CCCC-DDDD'))
    store.writeDeviceAuthorization({
      ...fakeDeviceAuth('device-3', 'EEEE-FFFF'),
      status: 'approved',
    })
    expect(store.listPendingDeviceAuthorizations().map((d) => d.deviceCode)).toEqual(['device-2'])
  })
})

describe('AccessStore audit log', () => {
  function fakeEvent(id: string, grantId?: string): AuditEvent {
    return {
      id,
      type: 'authorization.allowed',
      timestamp: new Date().toISOString(),
      ...(grantId === undefined ? {} : { grantId }),
    }
  }

  it('appends and lists events, filtering by grantId and honoring limit, newest first', () => {
    store.appendAuditEvent(fakeEvent('e1', 'grant-a'))
    store.appendAuditEvent(fakeEvent('e2', 'grant-b'))
    store.appendAuditEvent(fakeEvent('e3', 'grant-a'))

    expect(store.listAuditEvents({ grantId: 'grant-a' }).map((e) => e.id)).toEqual(['e3', 'e1'])
    expect(store.listAuditEvents().map((e) => e.id)).toEqual(['e3', 'e2', 'e1'])
    expect(store.listAuditEvents({ limit: 1 }).map((e) => e.id)).toEqual(['e3'])
  })

  it('returns an empty list when no audit log file exists yet', () => {
    expect(store.listAuditEvents()).toEqual([])
  })

  it('skips a torn final line without losing prior events', () => {
    store.appendAuditEvent(fakeEvent('e4'))
    const auditPath = join(root, '.symbolwright', 'access', 'audit.jsonl')
    appendFileSync(auditPath, '{"id":"torn", not valid json')
    const events = store.listAuditEvents()
    expect(events.map((e) => e.id)).toEqual(['e4'])
    expect(readFileSync(auditPath, 'utf8')).toContain('torn')
  })
})
