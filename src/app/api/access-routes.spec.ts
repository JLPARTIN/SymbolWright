import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { AccessRuntime } from '../../access/access-runtime.js'
import { UnlimitedRateLimiter } from '../../server/rate-limiter.js'
import { startChatServer, type StartedChatServer } from '../../server/symbolwright-chat-server.js'

const API_KEY = 'access-routes-test-key'
let root: string
let started: StartedChatServer | undefined

function operatorAuth(): Record<string, string> {
  return { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' }
}

async function launch(): Promise<StartedChatServer> {
  root = mkdtempSync(join(tmpdir(), 'symbolwright-access-routes-'))
  started = await startChatServer({
    apiKey: API_KEY,
    host: '127.0.0.1',
    port: 0,
    cwd: root,
    env: {},
    rateLimiter: new UnlimitedRateLimiter(),
  })
  return started
}

async function createGrant(
  server: StartedChatServer,
  overrides: Record<string, unknown> = {},
): Promise<{ grantId: string; token: string }> {
  const response = await fetch(`${server.url}/api/v1/access-grants`, {
    method: 'POST',
    headers: operatorAuth(),
    body: JSON.stringify({
      principalType: 'coding-agent',
      displayName: 'Fixture agent',
      profileId: 'coding-agent',
      repositoryScope: { mode: 'installation', repositories: [], organizations: [] },
      ...overrides,
    }),
  })
  const body = (await response.json()) as { grant: { id: string }; plaintextToken: string }
  return { grantId: body.grant.id, token: body.plaintextToken }
}

afterEach(async () => {
  if (started !== undefined) {
    await new Promise<void>((resolve) => started?.server.close(() => resolve()))
    started = undefined
  }
  if (root !== undefined) rmSync(root, { recursive: true, force: true })
})

describe('permissions and profile catalog routes', () => {
  it('returns the capability catalog and the permission profiles without operator auth', async () => {
    const server = await launch()
    const catalog = await fetch(`${server.url}/api/v1/permissions/catalog`, {
      headers: operatorAuth(),
    })
    expect(catalog.status).toBe(200)
    const catalogBody = (await catalog.json()) as { capabilities: readonly unknown[] }
    expect(catalogBody.capabilities.length).toBeGreaterThan(10)

    const profiles = await fetch(`${server.url}/api/v1/permissions/profiles`, {
      headers: operatorAuth(),
    })
    expect(profiles.status).toBe(200)
    const profilesBody = (await profiles.json()) as { profiles: readonly { id: string }[] }
    expect(profilesBody.profiles.map((p) => p.id)).toContain('coding-agent')
  })
})

describe('grant CRUD error paths', () => {
  it('404s on GET/DELETE for an unknown grant id, and errors on validation failures', async () => {
    const server = await launch()
    const missing = await fetch(`${server.url}/api/v1/access-grants/does-not-exist`, {
      headers: operatorAuth(),
    })
    expect(missing.status).toBe(404)

    const badProfile = await fetch(`${server.url}/api/v1/access-grants`, {
      method: 'POST',
      headers: operatorAuth(),
      body: JSON.stringify({
        principalType: 'coding-agent',
        displayName: 'x',
        profileId: 'not-a-real-profile',
        repositoryScope: { mode: 'installation', repositories: [], organizations: [] },
      }),
    })
    expect(badProfile.status).toBe(400)
    const badProfileBody = (await badProfile.json()) as { error: string }
    expect(badProfileBody.error).toBe('validation_error')

    const missingStepUp = await fetch(`${server.url}/api/v1/access-grants`, {
      method: 'POST',
      headers: operatorAuth(),
      body: JSON.stringify({
        principalType: 'human',
        displayName: 'break-glass',
        profileId: 'temporary-administrator',
        repositoryScope: { mode: 'installation', repositories: [], organizations: [] },
      }),
    })
    expect(missingStepUp.status).toBe(400)
    const stepUpBody = (await missingStepUp.json()) as { error: string }
    expect(stepUpBody.error).toBe('step_up_required')
  })

  it('deletes a grant', async () => {
    const server = await launch()
    const { grantId } = await createGrant(server)
    const del = await fetch(`${server.url}/api/v1/access-grants/${grantId}`, {
      method: 'DELETE',
      headers: operatorAuth(),
    })
    expect(del.status).toBe(200)
    const after = await fetch(`${server.url}/api/v1/access-grants/${grantId}`, {
      headers: operatorAuth(),
    })
    expect(after.status).toBe(404)
  })
})

describe('PATCH /api/v1/access-grants/:id — narrowing only', () => {
  it('adds denied capabilities, tightens metadata, and shortens expiry', async () => {
    const server = await launch()
    const { grantId } = await createGrant(server)

    const patch = await fetch(`${server.url}/api/v1/access-grants/${grantId}`, {
      method: 'PATCH',
      headers: operatorAuth(),
      body: JSON.stringify({
        displayName: 'Renamed',
        reason: 'narrowing test',
        additionalDeniedCapabilities: ['repo.commit.push'],
      }),
    })
    expect(patch.status).toBe(200)
    const body = (await patch.json()) as {
      grant: {
        displayName: string
        deniedCapabilities: readonly string[]
        githubCapabilities: readonly string[]
      }
    }
    expect(body.grant.displayName).toBe('Renamed')
    expect(body.grant.deniedCapabilities).toContain('repo.commit.push')
    expect(body.grant.githubCapabilities).not.toContain('repo.commit.push')
  })

  it('rejects extending expiresAt', async () => {
    const server = await launch()
    const { grantId } = await createGrant(server)
    const detail = await fetch(`${server.url}/api/v1/access-grants/${grantId}`, {
      headers: operatorAuth(),
    })
    const detailBody = (await detail.json()) as { grant: { expiresAt: string } }
    const later = new Date(new Date(detailBody.grant.expiresAt).getTime() + 100_000).toISOString()

    const patch = await fetch(`${server.url}/api/v1/access-grants/${grantId}`, {
      method: 'PATCH',
      headers: operatorAuth(),
      body: JSON.stringify({ expiresAt: later }),
    })
    expect(patch.status).toBe(400)
  })
})

describe('device authorization operator routes', () => {
  it('lists pending, approves, and denies device authorization requests', async () => {
    const server = await launch()
    const requestResponse = await fetch(`${server.url}/api/v1/device-authorization`, {
      method: 'POST',
      body: JSON.stringify({
        principalType: 'coding-agent',
        displayName: 'Terminal agent',
        requestedProfileId: 'coding-agent',
        requestedRepositoryScope: { mode: 'installation', repositories: [], organizations: [] },
      }),
    })
    expect(requestResponse.status).toBe(200)
    const requestBody = (await requestResponse.json()) as { userCode: string; deviceCode: string }

    const pending = await fetch(`${server.url}/api/v1/device-authorization/pending`, {
      headers: operatorAuth(),
    })
    expect(pending.status).toBe(200)
    const pendingBody = (await pending.json()) as { pending: readonly { userCode: string }[] }
    expect(pendingBody.pending.map((entry) => entry.userCode)).toContain(requestBody.userCode)

    const approve = await fetch(`${server.url}/api/v1/device-authorization/approve`, {
      method: 'POST',
      headers: operatorAuth(),
      body: JSON.stringify({ userCode: requestBody.userCode }),
    })
    expect(approve.status).toBe(200)

    const secondRequest = await fetch(`${server.url}/api/v1/device-authorization`, {
      method: 'POST',
      body: JSON.stringify({
        principalType: 'llm',
        displayName: 'Another agent',
        requestedProfileId: 'coding-agent',
        requestedRepositoryScope: { mode: 'installation', repositories: [], organizations: [] },
      }),
    })
    const secondBody = (await secondRequest.json()) as { userCode: string }
    const deny = await fetch(`${server.url}/api/v1/device-authorization/deny`, {
      method: 'POST',
      headers: operatorAuth(),
      body: JSON.stringify({ userCode: secondBody.userCode }),
    })
    expect(deny.status).toBe(200)
  })

  it('rejects an invalid principalType at request time, and an unknown userCode at approve time', async () => {
    const server = await launch()
    const badRequest = await fetch(`${server.url}/api/v1/device-authorization`, {
      method: 'POST',
      body: JSON.stringify({ principalType: 'not-a-real-type' }),
    })
    expect(badRequest.status).toBe(400)

    const badApprove = await fetch(`${server.url}/api/v1/device-authorization/approve`, {
      method: 'POST',
      headers: operatorAuth(),
      body: JSON.stringify({ userCode: 'ZZZZ-ZZZZ' }),
    })
    expect(badApprove.status).toBe(400)
    const body = (await badApprove.json()) as { error: string }
    expect(body.error).toBe('device_authorization_error')
  })

  it('rejects an invalid device_code at poll time', async () => {
    const server = await launch()
    const poll = await fetch(`${server.url}/api/v1/oauth/token`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    expect(poll.status).toBe(400)
  })
})

describe('POST /api/v1/access-grants — session/execution limits and approval policy', () => {
  it('accepts executionLimits, sessionLimits, clientConstraints, and approvalPolicy', async () => {
    const server = await launch()
    const created = await createGrant(server, {
      executionLimits: { maxConcurrentMissions: 2, maxFilesChanged: 10 },
      sessionLimits: { inactivityTimeoutMinutes: 15, maxConcurrentSessions: 1 },
      clientConstraints: { allowedIpCidrs: ['10.0.0.0/24'] },
      approvalPolicy: { rules: [{ match: '*', requirement: 'before-first-write' }] },
    })

    const detail = await fetch(`${server.url}/api/v1/access-grants/${created.grantId}`, {
      headers: operatorAuth(),
    })
    const body = (await detail.json()) as {
      grant: {
        executionLimits: { maxConcurrentMissions?: number; maxFilesChanged?: number }
        sessionLimits: { inactivityTimeoutMinutes?: number; maxConcurrentSessions?: number }
        clientConstraints?: { allowedIpCidrs?: readonly string[] }
        approvalPolicy: { rules: readonly { match: string; requirement: string }[] }
      }
    }
    expect(body.grant.executionLimits.maxConcurrentMissions).toBe(2)
    expect(body.grant.executionLimits.maxFilesChanged).toBe(10)
    expect(body.grant.sessionLimits.inactivityTimeoutMinutes).toBe(15)
    expect(body.grant.clientConstraints?.allowedIpCidrs).toEqual(['10.0.0.0/24'])
    expect(body.grant.approvalPolicy.rules).toEqual([
      { match: '*', requirement: 'before-first-write' },
    ])
  })

  it('rejects an invalid executionLimits field with a validation error', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/v1/access-grants`, {
      method: 'POST',
      headers: operatorAuth(),
      body: JSON.stringify({
        principalType: 'coding-agent',
        displayName: 'Bad limits',
        profileId: 'coding-agent',
        repositoryScope: { mode: 'installation', repositories: [], organizations: [] },
        executionLimits: { maxFilesChanged: -5 },
      }),
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string }
    expect(body.error).toBe('validation_error')
  })

  it('rejects executionLimits.sandboxNetworkAccess: true -- the sandbox has no code path that honors it', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/v1/access-grants`, {
      method: 'POST',
      headers: operatorAuth(),
      body: JSON.stringify({
        principalType: 'coding-agent',
        displayName: 'Wants sandbox network',
        profileId: 'coding-agent',
        repositoryScope: { mode: 'installation', repositories: [], organizations: [] },
        executionLimits: { sandboxNetworkAccess: true },
      }),
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string }
    expect(body.error).toBe('validation_error')
  })
})

describe('PATCH /api/v1/access-grants/:id — session/execution limits and client constraints', () => {
  it('narrows executionLimits, sessionLimits, and clientConstraints', async () => {
    const server = await launch()
    const { grantId } = await createGrant(server, {
      executionLimits: { maxConcurrentMissions: 5 },
      sessionLimits: { maxConcurrentSessions: 5 },
    })

    const patch = await fetch(`${server.url}/api/v1/access-grants/${grantId}`, {
      method: 'PATCH',
      headers: operatorAuth(),
      body: JSON.stringify({
        executionLimits: { maxConcurrentMissions: 1 },
        sessionLimits: { maxConcurrentSessions: 1, inactivityTimeoutMinutes: 20 },
        clientConstraints: { allowedIpCidrs: ['192.168.1.0/24'] },
      }),
    })
    expect(patch.status).toBe(200)
    const body = (await patch.json()) as {
      grant: {
        executionLimits: { maxConcurrentMissions?: number }
        sessionLimits: { maxConcurrentSessions?: number; inactivityTimeoutMinutes?: number }
        clientConstraints?: { allowedIpCidrs?: readonly string[] }
      }
    }
    expect(body.grant.executionLimits.maxConcurrentMissions).toBe(1)
    expect(body.grant.sessionLimits.maxConcurrentSessions).toBe(1)
    expect(body.grant.sessionLimits.inactivityTimeoutMinutes).toBe(20)
    expect(body.grant.clientConstraints?.allowedIpCidrs).toEqual(['192.168.1.0/24'])
  })

  it('rejects patching executionLimits.sandboxNetworkAccess to true', async () => {
    const server = await launch()
    const { grantId } = await createGrant(server)

    const patch = await fetch(`${server.url}/api/v1/access-grants/${grantId}`, {
      method: 'PATCH',
      headers: operatorAuth(),
      body: JSON.stringify({ executionLimits: { sandboxNetworkAccess: true } }),
    })
    expect(patch.status).toBe(400)
    const body = (await patch.json()) as { error: string }
    expect(body.error).toBe('validation_error')
  })
})

describe('approval approve/deny routes', () => {
  it('lists, approves, and denies pending approvals for a grant', async () => {
    const accessRuntimeRoot = mkdtempSync(join(tmpdir(), 'symbolwright-access-routes-runtime-'))
    const accessRuntime = new AccessRuntime({ workspaceRoot: accessRuntimeRoot })
    root = accessRuntimeRoot
    started = await startChatServer({
      apiKey: API_KEY,
      host: '127.0.0.1',
      port: 0,
      cwd: accessRuntimeRoot,
      env: {},
      rateLimiter: new UnlimitedRateLimiter(),
      accessRuntime,
    })
    const server = started

    const { grant } = accessRuntime.grantService.createGrant({
      principalType: 'automation',
      displayName: 'Maintainer',
      issuedBy: 'operator',
      profileId: 'maintainer-agent',
      repositoryScope: { mode: 'installation', repositories: [], organizations: [] },
      enableMerge: true,
      issueTokenNow: false,
    })
    const grantId = grant.id

    // Directly evaluate the gated capability to create a pending approval — mirrors what would
    // happen inside a real repository-mutation route once `repo.pull_request.merge` is wired to one.
    await accessRuntime.authorizationService.evaluate({
      principalId: grant.principalId,
      grantId: grant.id,
      capability: 'repo.pull_request.merge',
      repository: 'JLPARTIN/SymbolWright',
      missionId: 'mission-1',
    })

    const listed = await fetch(`${server.url}/api/v1/access-grants/${grantId}/approvals`, {
      headers: operatorAuth(),
    })
    expect(listed.status).toBe(200)
    const listedBody = (await listed.json()) as {
      approvals: readonly { id: string; status: string }[]
    }
    const pending = listedBody.approvals.find((entry) => entry.status === 'pending')
    expect(pending).toBeDefined()

    const approve = await fetch(
      `${server.url}/api/v1/access-grants/${grantId}/approvals/${pending?.id}/approve`,
      {
        method: 'POST',
        headers: operatorAuth(),
        body: JSON.stringify({ comment: 'ok' }),
      },
    )
    expect(approve.status).toBe(200)
    const approveBody = (await approve.json()) as { approval: { status: string } }
    expect(approveBody.approval.status).toBe('approved')

    const alreadyDecided = await fetch(
      `${server.url}/api/v1/access-grants/${grantId}/approvals/${pending?.id}/deny`,
      { method: 'POST', headers: operatorAuth() },
    )
    expect(alreadyDecided.status).toBe(400)
  })

  it('404s approving an unknown approval id', async () => {
    const server = await launch()
    const { grantId } = await createGrant(server)
    const response = await fetch(
      `${server.url}/api/v1/access-grants/${grantId}/approvals/does-not-exist/approve`,
      { method: 'POST', headers: operatorAuth() },
    )
    expect(response.status).toBe(404)
  })

  it('denies an agent principal from approving its own request', async () => {
    const server = await launch()
    const { grantId, token } = await createGrant(server)
    const response = await fetch(
      `${server.url}/api/v1/access-grants/${grantId}/approvals/anything/approve`,
      { method: 'POST', headers: { authorization: `Bearer ${token}` } },
    )
    expect(response.status).toBe(403)
  })
})

describe('operator-only enforcement for agent principals', () => {
  it('denies an agent principal from every grant-management route', async () => {
    const server = await launch()
    const { token } = await createGrant(server)
    const agentAuth = { authorization: `Bearer ${token}` }

    const list = await fetch(`${server.url}/api/v1/access-grants`, { headers: agentAuth })
    expect(list.status).toBe(403)

    const audit = await fetch(`${server.url}/api/v1/audit/agent-access`, { headers: agentAuth })
    expect(audit.status).toBe(403)

    const pending = await fetch(`${server.url}/api/v1/device-authorization/pending`, {
      headers: agentAuth,
    })
    expect(pending.status).toBe(403)
  })
})
