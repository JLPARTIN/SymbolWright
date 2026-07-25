import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

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
