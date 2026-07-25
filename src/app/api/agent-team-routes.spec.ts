import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runGitCommand } from '../../runtime/git/git-command-runner.js'
import { UnlimitedRateLimiter } from '../../server/rate-limiter.js'
import { startChatServer, type StartedChatServer } from '../../server/symbolwright-chat-server.js'

// Real `git` subprocesses plus a real HTTP server, matching `delegated-agent-access-e2e.spec.ts`.
vi.setConfig({ testTimeout: 20_000 })

const API_KEY = 'operator-key-for-agent-team-routes-test'

let started: StartedChatServer | undefined
let cwd: string

beforeEach(async () => {
  cwd = mkdtempSync(join(tmpdir(), 'symbolwright-agent-team-routes-'))
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
    cwd,
    rateLimiter: new UnlimitedRateLimiter(),
  })
  return started
}

function auth(): Record<string, string> {
  return { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' }
}

describe('/api/v1/agent-teams — real production HTTP route, same dispatcher as every other API', () => {
  it('rejects unauthenticated requests', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/v1/agent-teams`)
    expect(response.status).toBe(401)
  })

  it('drives team creation, membership, tasks, and assignment through the live HTTP route', async () => {
    const server = await launch()

    const createTeamResponse = await fetch(`${server.url}/api/v1/agent-teams`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        missionId: 'mission-http-1',
        name: 'HTTP-driven team',
        objective: 'Prove the REST surface is production-reachable',
        repositoryRoot: cwd,
      }),
    })
    expect(createTeamResponse.status).toBe(201)
    const { team } = (await createTeamResponse.json()) as { team: { id: string } }
    expect(team.id).toBeDefined()

    const listResponse = await fetch(`${server.url}/api/v1/agent-teams`, { headers: auth() })
    expect(listResponse.status).toBe(200)
    const { teams } = (await listResponse.json()) as { teams: unknown[] }
    expect(teams).toHaveLength(1)

    const addMemberResponse = await fetch(`${server.url}/api/v1/agent-teams/${team.id}/members`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        displayName: 'Investigator',
        role: 'repository-investigator',
        provider: 'symbolwright-native',
        trustTier: 'standard',
        accessProfileId: 'repository-analyst',
        principalType: 'coding-agent',
      }),
    })
    expect(addMemberResponse.status).toBe(201)
    const { member } = (await addMemberResponse.json()) as { member: { id: string } }
    expect(member.id).toBeDefined()

    const createTaskResponse = await fetch(`${server.url}/api/v1/agent-teams/${team.id}/tasks`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        title: 'Investigate the recovery path',
        objective: 'Find the root cause',
        taskType: 'investigation',
        executionMode: 'analysis',
        assignmentPolicy: 'single-agent',
      }),
    })
    expect(createTaskResponse.status).toBe(201)
    const { task } = (await createTaskResponse.json()) as { task: { id: string } }

    const assignResponse = await fetch(
      `${server.url}/api/v1/agent-teams/${team.id}/tasks/${task.id}/assign`,
      { method: 'POST', headers: auth() },
    )
    expect(assignResponse.status).toBe(200)
    const { decision } = (await assignResponse.json()) as {
      decision: { selectedAgentIds: string[] }
    }
    expect(decision.selectedAgentIds).toEqual([member.id])

    const eventsResponse = await fetch(`${server.url}/api/v1/agent-teams/${team.id}/events`, {
      headers: auth(),
    })
    expect(eventsResponse.status).toBe(200)
    const { events } = (await eventsResponse.json()) as { events: Array<{ type: string }> }
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['team.created', 'member.added', 'task.created', 'task.assigned']),
    )
  })

  it('lists the built-in role catalog', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/v1/agent-roles`, { headers: auth() })
    expect(response.status).toBe(200)
    const { roles } = (await response.json()) as { roles: Array<{ id: string }> }
    expect(roles.map((r) => r.id)).toEqual(
      expect.arrayContaining(['lead-orchestrator', 'implementation-agent']),
    )
  })

  async function postJson(server: StartedChatServer, path: string, body?: unknown) {
    const response = await fetch(`${server.url}${path}`, {
      method: 'POST',
      headers: auth(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: response.status, body: (await response.json()) as Record<string, unknown> }
  }

  it('drives workspace creation, candidate submission, review, and integration entirely over HTTP', async () => {
    const server = await launch()

    const { body: teamBody } = await postJson(server, '/api/v1/agent-teams', {
      missionId: 'mission-http-2',
      name: 'Full HTTP flow',
      objective: 'Prove candidate submission and integration are REST-reachable',
      repositoryRoot: cwd,
    })
    const teamId = (teamBody['team'] as { id: string }).id

    const { body: authorBody } = await postJson(server, `/api/v1/agent-teams/${teamId}/members`, {
      displayName: 'Implementer',
      role: 'implementation-agent',
      provider: 'symbolwright-native',
      trustTier: 'standard',
      accessProfileId: 'coding-agent',
      principalType: 'coding-agent',
    })
    const authorId = (authorBody['member'] as { id: string }).id

    const { body: reviewerBody } = await postJson(server, `/api/v1/agent-teams/${teamId}/members`, {
      displayName: 'Reviewer',
      role: 'adversarial-reviewer',
      provider: 'symbolwright-native',
      trustTier: 'trusted',
      accessProfileId: 'repository-analyst',
      principalType: 'llm',
    })
    const reviewerId = (reviewerBody['member'] as { id: string }).id

    const { body: taskBody } = await postJson(server, `/api/v1/agent-teams/${teamId}/tasks`, {
      title: 'Update README',
      objective: 'Add a line',
      taskType: 'implementation',
      executionMode: 'isolated-mutation',
      assignmentPolicy: 'single-agent',
      writePaths: ['README.md'],
    })
    const taskId = (taskBody['task'] as { id: string }).id

    const { status: workspaceStatus, body: workspaceBody } = await postJson(
      server,
      `/api/v1/agent-teams/${teamId}/workspaces`,
      { taskId, agentId: authorId, allowedWritePaths: ['README.md'] },
    )
    expect(workspaceStatus).toBe(201)
    const workspace = workspaceBody['workspace'] as { id: string; rootPath: string }

    writeFileSync(join(workspace.rootPath, 'README.md'), '# hello\nAdded via HTTP\n')

    const { status: candidateStatus, body: candidateBody } = await postJson(
      server,
      `/api/v1/agent-teams/${teamId}/candidates`,
      { taskId, agentId: authorId, workspaceId: workspace.id, rationale: 'Add a line to README.' },
    )
    expect(candidateStatus).toBe(201)
    const candidate = candidateBody['candidate'] as { id: string }

    // author cannot review its own candidate
    const { status: selfReviewStatus } = await postJson(
      server,
      `/api/v1/agent-teams/${teamId}/candidates/${candidate.id}/review`,
      { reviewerId: authorId, verdict: 'approve', rationale: 'looks fine', findings: [] },
    )
    expect(selfReviewStatus).toBe(403)

    // accept before any review is rejected — review is required first
    const { status: prematureAcceptStatus } = await postJson(
      server,
      `/api/v1/agent-teams/${teamId}/candidates/${candidate.id}/accept`,
    )
    expect(prematureAcceptStatus).toBe(409)

    const { status: reviewStatus } = await postJson(
      server,
      `/api/v1/agent-teams/${teamId}/candidates/${candidate.id}/review`,
      { reviewerId, verdict: 'approve', rationale: 'Small, safe change.', findings: [] },
    )
    expect(reviewStatus).toBe(201)

    const { status: acceptStatus } = await postJson(
      server,
      `/api/v1/agent-teams/${teamId}/candidates/${candidate.id}/accept`,
      { rationale: 'Approved.' },
    )
    expect(acceptStatus).toBe(200)

    const { status: planStatus, body: planBody } = await postJson(
      server,
      `/api/v1/agent-teams/${teamId}/integrations`,
      { candidateIds: [candidate.id] },
    )
    expect(planStatus).toBe(201)
    const plan = planBody['plan'] as { id: string; status: string }
    expect(plan.status).toBe('ready')

    // rollback of a not-yet-executed plan is a legitimate (if unusual) operator action
    const { status: rollbackStatus } = await postJson(
      server,
      `/api/v1/agent-teams/${teamId}/integrations/${plan.id}/rollback`,
      { reason: 'operator sanity check' },
    )
    expect(rollbackStatus).toBe(200)

    // re-prepare after the rollback reset HEAD, then actually execute
    const { body: replanBody } = await postJson(
      server,
      `/api/v1/agent-teams/${teamId}/integrations`,
      {
        candidateIds: [candidate.id],
      },
    )
    const replan = replanBody['plan'] as { id: string }
    const { status: executeStatus, body: executeBody } = await postJson(
      server,
      `/api/v1/agent-teams/${teamId}/integrations/${replan.id}/execute`,
      {},
    )
    expect(executeStatus).toBe(200)
    expect((executeBody['result'] as { status: string }).status).toBe('succeeded')

    // member removal revokes access immediately
    const removeResponse = await fetch(
      `${server.url}/api/v1/agent-teams/${teamId}/members/${authorId}`,
      {
        method: 'DELETE',
        headers: auth(),
      },
    )
    expect(removeResponse.status).toBe(200)
  })

  it('returns validation errors for malformed requests and 404 for unknown teams/routes', async () => {
    const server = await launch()

    const missingFields = await postJson(server, '/api/v1/agent-teams', { name: 'incomplete' })
    expect(missingFields.status).toBe(400)

    const unknownTeam = await fetch(`${server.url}/api/v1/agent-teams/does-not-exist`, {
      headers: auth(),
    })
    expect(unknownTeam.status).toBe(404)

    const unknownRoute = await fetch(`${server.url}/api/v1/agent-teams/x/not-a-real-subroute`, {
      headers: auth(),
    })
    expect(unknownRoute.status).toBe(404)

    const { body: teamBody } = await postJson(server, '/api/v1/agent-teams', {
      missionId: 'mission-http-3',
      name: 'Validation team',
      objective: 'Exercise validation errors',
      repositoryRoot: cwd,
    })
    const teamId = (teamBody['team'] as { id: string }).id

    const badRole = await postJson(server, `/api/v1/agent-teams/${teamId}/members`, {
      displayName: 'Bad',
      role: 'not-a-real-role',
      provider: 'symbolwright-native',
      trustTier: 'standard',
      accessProfileId: 'coding-agent',
      principalType: 'coding-agent',
    })
    expect(badRole.status).toBe(400)

    const badProvider = await postJson(server, `/api/v1/agent-teams/${teamId}/members`, {
      displayName: 'Bad',
      role: 'implementation-agent',
      provider: 'not-a-real-provider',
      trustTier: 'standard',
      accessProfileId: 'coding-agent',
      principalType: 'coding-agent',
    })
    expect(badProvider.status).toBe(400)

    const badTrust = await postJson(server, `/api/v1/agent-teams/${teamId}/members`, {
      displayName: 'Bad',
      role: 'implementation-agent',
      provider: 'symbolwright-native',
      trustTier: 'not-a-real-tier',
      accessProfileId: 'coding-agent',
      principalType: 'coding-agent',
    })
    expect(badTrust.status).toBe(400)

    const missingTaskFields = await postJson(server, `/api/v1/agent-teams/${teamId}/tasks`, {
      title: 'incomplete',
    })
    expect(missingTaskFields.status).toBe(400)

    const invalidTransition = await postJson(server, `/api/v1/agent-teams/${teamId}/pause`)
    expect(invalidTransition.status).toBe(400)
  })
})
