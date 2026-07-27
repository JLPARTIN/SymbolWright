import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runGitCommand } from '../runtime/git/git-command-runner.js'
import { UnlimitedRateLimiter } from './rate-limiter.js'
import { startChatServer, type StartedChatServer } from './symbolwright-chat-server.js'

/**
 * Regression coverage for Bundle #12 PR 1: every mission-linked surface (missions themselves,
 * `/api/agent`, sandbox executions, checkpoints, memory, agent-teams, mission import) previously
 * checked only that a caller held the right *capability class* (e.g.
 * `symbolwright.mission.read`), never that the specific resource belonged to them. A delegated
 * grant could read, mutate, or control another grant's missions, sandbox executions, and teams
 * purely by knowing (or enumerating) their ids.
 */

vi.setConfig({ testTimeout: 20_000 })

const API_KEY = 'operator-key-for-ownership-boundary-test'

let started: StartedChatServer | undefined
let cwd: string

beforeEach(async () => {
  cwd = mkdtempSync(join(tmpdir(), 'symbolwright-ownership-boundary-'))
  await runGitCommand(['init'], cwd)
  await runGitCommand(['config', 'user.email', 'test@example.com'], cwd)
  await runGitCommand(['config', 'user.name', 'Test'], cwd)
  writeFileSync(join(cwd, 'README.md'), '# hello\n')
  await runGitCommand(['add', '.'], cwd)
  await runGitCommand(['commit', '-m', 'initial commit'], cwd)
})

afterEach(async () => {
  if (started !== undefined) {
    await new Promise<void>((resolve) => started?.server.close(() => resolve()))
    started = undefined
  }
  rmSync(cwd, { recursive: true, force: true })
})

async function launch(): Promise<StartedChatServer> {
  started = await startChatServer({
    apiKey: API_KEY,
    host: '127.0.0.1',
    port: 0,
    env: {},
    cwd,
    rateLimiter: new UnlimitedRateLimiter(),
  })
  return started
}

function operatorAuth(): Record<string, string> {
  return { authorization: `Bearer ${API_KEY}` }
}

function agentAuth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` }
}

async function createCodingAgentGrant(
  server: StartedChatServer,
  overrides: Record<string, unknown> = {},
): Promise<{ grantId: string; token: string }> {
  const response = await fetch(`${server.url}/api/v1/access-grants`, {
    method: 'POST',
    headers: { ...operatorAuth(), 'content-type': 'application/json' },
    body: JSON.stringify({
      principalType: 'coding-agent',
      displayName: 'Claude Code (ownership boundary test)',
      profileId: 'coding-agent',
      repositoryScope: { mode: 'installation', repositories: [], organizations: [] },
      ...overrides,
    }),
  })
  expect(response.status).toBe(201)
  const body = (await response.json()) as { grant: { id: string }; plaintextToken: string }
  return { grantId: body.grant.id, token: body.plaintextToken }
}

/** `orchestration.team.*` isn't part of any default permission profile -- team-owning grants
 * need it granted explicitly, same as a real deployment would configure for a team-lead agent. */
async function createTeamOwnerGrant(
  server: StartedChatServer,
): Promise<{ grantId: string; token: string }> {
  return createCodingAgentGrant(server, {
    additionalSymbolWrightCapabilities: ['orchestration.team.manage', 'orchestration.team.read'],
  })
}

async function createMission(
  server: StartedChatServer,
  token: string,
): Promise<{ id: string; revision: number }> {
  const response = await fetch(`${server.url}/api/missions`, {
    method: 'POST',
    headers: { ...agentAuth(token), 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Mission',
      objective: 'Do the thing',
      workspaceKind: 'repository',
      repositoryPath: '.',
      runtimeMode: 'READ_ONLY',
    }),
  })
  expect(response.status).toBe(201)
  const body = (await response.json()) as { mission: { id: string; revision: number } }
  return body.mission
}

describe('Resource ownership boundary — end-to-end', () => {
  it('denies grant B read access to grant A mission with 404 (mutating actions covered at the unit level)', async () => {
    const server = await launch()
    const { token: tokenA } = await createCodingAgentGrant(server)
    const { token: tokenB } = await createCodingAgentGrant(server)
    const mission = await createMission(server, tokenA)

    const getResponse = await fetch(`${server.url}/api/missions/${mission.id}`, {
      headers: agentAuth(tokenB),
    })
    expect(getResponse.status).toBe(404)

    // PATCH/DELETE/autonomy actions require the `symbolwright.mission.execute`/`.cancel`
    // capability, whose *first* use per grant triggers an unrelated pre-existing
    // "before-first-write" human-approval gate (`access-profiles.ts`) that would otherwise
    // confound this test regardless of ownership. GET only requires `.read`, which carries no
    // such gate, so it isolates the ownership check cleanly; the mutating routes are exercised
    // for ownership at the unit level in `mission-routes.spec.ts` instead.
    const getResponse2 = await fetch(`${server.url}/api/missions/${mission.id}/events`, {
      headers: agentAuth(tokenB),
    })
    expect(getResponse2.status).toBe(404)

    // Grant A can still reach its own mission -- this isn't a global lockout.
    const ownGet = await fetch(`${server.url}/api/missions/${mission.id}`, {
      headers: agentAuth(tokenA),
    })
    expect(ownGet.status).toBe(200)
  })

  it('excludes grant B from grant A mission in the collection list, correcting the total', async () => {
    const server = await launch()
    const { token: tokenA } = await createCodingAgentGrant(server)
    const { token: tokenB } = await createCodingAgentGrant(server)
    await createMission(server, tokenA)
    const missionB = await createMission(server, tokenB)

    const listAsB = await fetch(`${server.url}/api/missions`, { headers: agentAuth(tokenB) })
    expect(listAsB.status).toBe(200)
    const bodyB = (await listAsB.json()) as {
      missions: { id: string }[]
      total: number
    }
    expect(bodyB.missions.map((m) => m.id)).toEqual([missionB.id])
    expect(bodyB.total).toBe(1)

    // Operator still sees everything, unrestricted.
    const listAsOperator = await fetch(`${server.url}/api/missions`, { headers: operatorAuth() })
    const bodyOperator = (await listAsOperator.json()) as { total: number }
    expect(bodyOperator.total).toBe(2)
  })

  it('denies /api/agent against another grant’s mission with 404', async () => {
    const server = await launch()
    const { token: tokenA } = await createCodingAgentGrant(server)
    const { token: tokenB } = await createCodingAgentGrant(server)
    const mission = await createMission(server, tokenA)

    const response = await fetch(`${server.url}/api/agent`, {
      method: 'POST',
      headers: { ...agentAuth(tokenB), 'content-type': 'application/json' },
      body: JSON.stringify({ missionId: mission.id, providerId: 'anthropic', message: 'hi' }),
    })
    expect(response.status).toBe(404)
  })

  it('scopes standalone sandbox executions to the executing grant', async () => {
    const server = await launch()
    const { token: tokenA } = await createCodingAgentGrant(server)
    const { token: tokenB } = await createCodingAgentGrant(server)

    const executeAsA = await fetch(`${server.url}/api/sandbox/execute`, {
      method: 'POST',
      headers: { ...agentAuth(tokenA), 'content-type': 'application/json' },
      body: JSON.stringify({
        languageId: 'javascript',
        mode: 'run',
        source: 'console.log(1 + 1)',
        runtimeMode: 'APPROVED_EXECUTION',
      }),
    })
    expect(executeAsA.status).toBe(200)
    const executed = (await executeAsA.json()) as { result: { executionId: string } }

    const listAsB = await fetch(`${server.url}/api/sandbox/executions`, {
      headers: agentAuth(tokenB),
    })
    const listBody = (await listAsB.json()) as { executions: { executionId: string }[] }
    expect(listBody.executions.map((e) => e.executionId)).not.toContain(executed.result.executionId)

    const getAsB = await fetch(
      `${server.url}/api/sandbox/executions/${executed.result.executionId}`,
      { headers: agentAuth(tokenB) },
    )
    expect(getAsB.status).toBe(404)

    const getAsA = await fetch(
      `${server.url}/api/sandbox/executions/${executed.result.executionId}`,
      { headers: agentAuth(tokenA) },
    )
    expect(getAsA.status).toBe(200)
  })

  it('rejects a delegated grant from every memory endpoint while the operator retains access', async () => {
    const server = await launch()
    const { token } = await createCodingAgentGrant(server)

    const recentAsAgent = await fetch(`${server.url}/api/memory/recent`, {
      headers: agentAuth(token),
    })
    expect(recentAsAgent.status).toBe(404)

    const proceduralAsAgent = await fetch(`${server.url}/api/memory/procedural`, {
      headers: agentAuth(token),
    })
    expect(proceduralAsAgent.status).toBe(404)

    const recentAsOperator = await fetch(`${server.url}/api/memory/recent`, {
      headers: operatorAuth(),
    })
    expect(recentAsOperator.status).toBe(200)
  })

  // Mission import's grantId-stripping is covered directly at the service level in
  // `mission-service.spec.ts` -- `/api/missions/import` isn't in any delegated agent's
  // route-capability map today (a separate, pre-existing gap outside this PR's scope), so an
  // end-to-end HTTP version of this scenario can't be driven by a non-operator caller.

  it('denies grant B every team action on a team grant A created, listing only its own teams', async () => {
    const server = await launch()
    const { token: tokenA } = await createTeamOwnerGrant(server)
    const { token: tokenB } = await createTeamOwnerGrant(server)
    const mission = await createMission(server, tokenA)

    const createTeamResponse = await fetch(`${server.url}/api/v1/agent-teams`, {
      method: 'POST',
      headers: { ...agentAuth(tokenA), 'content-type': 'application/json' },
      body: JSON.stringify({
        missionId: mission.id,
        name: 'Team A',
        objective: 'Ship the thing',
      }),
    })
    expect(createTeamResponse.status).toBe(201)
    const team = (await createTeamResponse.json()) as { team: { id: string } }

    const getAsB = await fetch(`${server.url}/api/v1/agent-teams/${team.team.id}`, {
      headers: agentAuth(tokenB),
    })
    expect(getAsB.status).toBe(404)

    const listAsB = await fetch(`${server.url}/api/v1/agent-teams`, { headers: agentAuth(tokenB) })
    const listBodyB = (await listAsB.json()) as { teams: { id: string }[] }
    expect(listBodyB.teams).toHaveLength(0)

    const listAsA = await fetch(`${server.url}/api/v1/agent-teams`, { headers: agentAuth(tokenA) })
    const listBodyA = (await listAsA.json()) as { teams: { id: string }[] }
    expect(listBodyA.teams.map((t) => t.id)).toEqual([team.team.id])
  })

  it('rejects a caller-supplied repositoryRoot for a delegated grant, deriving it from the mission', async () => {
    const server = await launch()
    const { token } = await createTeamOwnerGrant(server)
    const mission = await createMission(server, token)

    const createTeamResponse = await fetch(`${server.url}/api/v1/agent-teams`, {
      method: 'POST',
      headers: { ...agentAuth(token), 'content-type': 'application/json' },
      body: JSON.stringify({
        missionId: mission.id,
        name: 'Team',
        objective: 'Ship the thing',
        repositoryRoot: '/tmp/spoofed-repository-root',
      }),
    })
    expect(createTeamResponse.status).toBe(201)
    const team = (await createTeamResponse.json()) as {
      team: { repositoryRoot: string }
    }
    expect(team.team.repositoryRoot).not.toBe('/tmp/spoofed-repository-root')
  })
})
