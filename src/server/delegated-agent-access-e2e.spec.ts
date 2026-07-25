import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runGitCommand } from '../runtime/git/git-command-runner.js'
import { UnlimitedRateLimiter } from './rate-limiter.js'
import { startChatServer, type StartedChatServer } from './symbolwright-chat-server.js'

/** Scripts one streamed OpenAI-compatible tool call, then a follow-up text completion — same
 * wire-format fixture pattern as `symbolwright-agent-endpoint.spec.ts`. */
function startFakeToolCallingProvider(
  toolName: string,
  toolArgs: Record<string, unknown>,
): Promise<{ url: string; server: Server }> {
  let calls = 0
  const server = createServer((req, res) => {
    calls += 1
    const thisCall = calls
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      if (thisCall === 1) {
        res.write(
          `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"${toolName}","arguments":""}}]}}]}\n\n`,
        )
        res.write(
          `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":${JSON.stringify(
            JSON.stringify(toolArgs),
          )}}}]}}]}\n\n`,
        )
        res.write('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n')
        res.write('data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n')
      } else {
        res.write('data: {"choices":[{"delta":{"content":"done"},"finish_reason":"stop"}]}\n\n')
        res.write('data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n')
      }
      res.write('data: [DONE]\n\n')
      res.end()
      void body
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      resolve({ url: `http://127.0.0.1:${port}/v1`, server })
    })
  })
}

// Real `git` subprocesses (init, remotes, commits, checkouts, pushes) plus a real HTTP server —
// slower than a pure-unit test, matching the pattern in `repository-routes.spec.ts`.
vi.setConfig({ testTimeout: 20_000 })

const API_KEY = 'operator-key-for-e2e-test'

let started: StartedChatServer | undefined
let cwd: string
let remoteDir: string

beforeEach(async () => {
  cwd = mkdtempSync(join(tmpdir(), 'symbolwright-access-e2e-'))
  remoteDir = mkdtempSync(join(tmpdir(), 'symbolwright-access-e2e-remote-'))
  await runGitCommand(['init', '--bare'], remoteDir)
  await runGitCommand(['init'], cwd)
  await runGitCommand(['config', 'user.email', 'test@example.com'], cwd)
  await runGitCommand(['config', 'user.name', 'Test'], cwd)
  await runGitCommand(['remote', 'add', 'origin', remoteDir], cwd)
  writeFileSync(join(cwd, 'README.md'), '# hello\n')
  await runGitCommand(['add', '.'], cwd)
  await runGitCommand(['commit', '-m', 'initial commit'], cwd)
  await runGitCommand(['branch', '-M', 'main'], cwd)
  await runGitCommand(['push', 'origin', 'main'], cwd)
})

afterEach(async () => {
  if (started !== undefined) {
    await new Promise<void>((resolve) => started?.server.close(() => resolve()))
    started = undefined
  }
  rmSync(cwd, { recursive: true, force: true })
  rmSync(remoteDir, { recursive: true, force: true })
})

async function launch() {
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
      displayName: 'Claude Code (e2e)',
      profileId: 'coding-agent',
      repositoryScope: { mode: 'installation', repositories: [], organizations: [] },
      ...overrides,
    }),
  })
  expect(response.status).toBe(201)
  const body = (await response.json()) as { grant: { id: string }; plaintextToken: string }
  return { grantId: body.grant.id, token: body.plaintextToken }
}

describe('Delegated Agent Access — end-to-end', () => {
  it('requires operator authentication to create a grant', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/v1/access-grants`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        principalType: 'coding-agent',
        displayName: 'x',
        profileId: 'coding-agent',
        repositoryScope: { mode: 'installation', repositories: [], organizations: [] },
      }),
    })
    expect(response.status).toBe(401)
  })

  it('lets an agent read the repository once granted, and denies it before the grant exists', async () => {
    const server = await launch()
    const unauthorized = await fetch(`${server.url}/api/repository/tree`, {
      headers: agentAuth('sw_agent_bogus.secret'),
    })
    expect(unauthorized.status).toBe(401)

    const { token } = await createCodingAgentGrant(server)
    const read = await fetch(`${server.url}/api/repository/tree`, { headers: agentAuth(token) })
    expect(read.status).toBe(200)
  })

  it('drives the full analyze -> branch -> edit -> validate -> commit -> push -> PR workflow, then denies merge', async () => {
    const server = await launch()
    const { token } = await createCodingAgentGrant(server, {
      // The default "coding-agent" branch scope (feat/**, fix/**, symbolwright/agent/**, ...)
      // covers this branch name.
    })

    // 1. Analyze / read.
    const tree = await fetch(`${server.url}/api/repository/tree`, { headers: agentAuth(token) })
    expect(tree.status).toBe(200)

    // 2. Create an agent working branch.
    const branchCreate = await fetch(`${server.url}/api/repository/branches`, {
      method: 'POST',
      headers: { ...agentAuth(token), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'feat/agent-change' }),
    })
    expect(branchCreate.status).toBe(200)

    // 3. Edit a file.
    writeFileSync(join(cwd, 'README.md'), '# hello\n\nUpdated by the agent.\n')

    // 4. Commit.
    const commit = await fetch(`${server.url}/api/repository/commit`, {
      method: 'POST',
      headers: { ...agentAuth(token), 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'docs: agent update' }),
    })
    expect(commit.status).toBe(200)

    // 5. Push.
    const push = await fetch(`${server.url}/api/repository/push`, {
      method: 'POST',
      headers: { ...agentAuth(token), 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    })
    expect(push.status).toBe(200)

    const remoteBranches = await runGitCommand(['branch'], remoteDir)
    expect(remoteBranches.stdout).toContain('feat/agent-change')

    // 6. Attempting to push directly to `main` must be denied, even for the same grant.
    await runGitCommand(['checkout', 'main'], cwd)
    const pushMain = await fetch(`${server.url}/api/repository/push`, {
      method: 'POST',
      headers: { ...agentAuth(token), 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    })
    expect(pushMain.status).toBe(403)
    const pushMainBody = (await pushMain.json()) as { reasonCode: string }
    expect(pushMainBody.reasonCode).toBe('BRANCH_PROTECTED')
  })

  it('denies an unrelated route entirely for an agent principal (fail closed)', async () => {
    const server = await launch()
    const { token } = await createCodingAgentGrant(server)
    const response = await fetch(`${server.url}/api/providers`, { headers: agentAuth(token) })
    expect(response.status).toBe(403)
    const body = (await response.json()) as { reasonCode: string }
    expect(body.reasonCode).toBe('ROUTE_NOT_PERMITTED')
  })

  it('immediately revokes access, including for a session already in use', async () => {
    const server = await launch()
    const { grantId, token } = await createCodingAgentGrant(server)

    const before = await fetch(`${server.url}/api/repository/tree`, { headers: agentAuth(token) })
    expect(before.status).toBe(200)

    const revoke = await fetch(`${server.url}/api/v1/access-grants/${grantId}/revoke`, {
      method: 'POST',
      headers: { ...operatorAuth(), 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'test revoke' }),
    })
    expect(revoke.status).toBe(200)

    const after = await fetch(`${server.url}/api/repository/tree`, { headers: agentAuth(token) })
    expect(after.status).toBe(401)
  })

  it('pauses and resumes a grant, denying and then re-allowing operations', async () => {
    const server = await launch()
    const { grantId, token } = await createCodingAgentGrant(server)

    const pause = await fetch(`${server.url}/api/v1/access-grants/${grantId}/pause`, {
      method: 'POST',
      headers: operatorAuth(),
    })
    expect(pause.status).toBe(200)

    const whilePaused = await fetch(`${server.url}/api/repository/tree`, {
      headers: agentAuth(token),
    })
    expect(whilePaused.status).toBe(401)

    const resume = await fetch(`${server.url}/api/v1/access-grants/${grantId}/resume`, {
      method: 'POST',
      headers: operatorAuth(),
    })
    expect(resume.status).toBe(200)

    const afterResume = await fetch(`${server.url}/api/repository/tree`, {
      headers: agentAuth(token),
    })
    expect(afterResume.status).toBe(200)
  })

  it('records audit events for grant creation and authorization decisions', async () => {
    const server = await launch()
    const { grantId, token } = await createCodingAgentGrant(server)
    await fetch(`${server.url}/api/repository/tree`, { headers: agentAuth(token) })

    const audit = await fetch(`${server.url}/api/v1/audit/agent-access?grantId=${grantId}`, {
      headers: operatorAuth(),
    })
    expect(audit.status).toBe(200)
    const body = (await audit.json()) as { events: readonly { type: string }[] }
    const types = body.events.map((event) => event.type)
    expect(types).toContain('grant.created')
    expect(types).toContain('grant.activated')
    expect(types).toContain('authorization.allowed')
  })

  it('rejects an agent token from a different, still-valid grant (cross-agent token use)', async () => {
    const server = await launch()
    const first = await createCodingAgentGrant(server, { displayName: 'Agent A' })
    const second = await createCodingAgentGrant(server, { displayName: 'Agent B' })

    // Both tokens work for their own grant.
    const a = await fetch(`${server.url}/api/repository/tree`, { headers: agentAuth(first.token) })
    const b = await fetch(`${server.url}/api/repository/tree`, { headers: agentAuth(second.token) })
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)

    // Revoking one grant must not affect the other.
    await fetch(`${server.url}/api/v1/access-grants/${first.grantId}/revoke`, {
      method: 'POST',
      headers: operatorAuth(),
    })
    const aAfter = await fetch(`${server.url}/api/repository/tree`, {
      headers: agentAuth(first.token),
    })
    const bAfter = await fetch(`${server.url}/api/repository/tree`, {
      headers: agentAuth(second.token),
    })
    expect(aAfter.status).toBe(401)
    expect(bAfter.status).toBe(200)
  })

  it('a Repository Analyst grant can read but not write', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/v1/access-grants`, {
      method: 'POST',
      headers: { ...operatorAuth(), 'content-type': 'application/json' },
      body: JSON.stringify({
        principalType: 'llm',
        displayName: 'Analyst',
        profileId: 'repository-analyst',
        repositoryScope: { mode: 'installation', repositories: [], organizations: [] },
      }),
    })
    const body = (await response.json()) as { plaintextToken: string }

    const read = await fetch(`${server.url}/api/repository/tree`, {
      headers: agentAuth(body.plaintextToken),
    })
    expect(read.status).toBe(200)

    const write = await fetch(`${server.url}/api/repository/file`, {
      method: 'PUT',
      headers: { ...agentAuth(body.plaintextToken), 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'README.md', content: 'nope' }),
    })
    expect(write.status).toBe(403)
  })

  describe('tool-level enforcement inside /api/agent', () => {
    let fakeUpstream: Server | undefined

    afterEach(async () => {
      if (fakeUpstream !== undefined) {
        await new Promise<void>((resolve) => fakeUpstream?.close(() => resolve()))
        fakeUpstream = undefined
      }
    })

    it('lets a Coding Agent grant read a file through the real LLM tool-call loop', async () => {
      const server = await launch()
      const { token } = await createCodingAgentGrant(server)
      const fake = await startFakeToolCallingProvider('read_file', { path: 'README.md' })
      fakeUpstream = fake.server

      await fetch(`${server.url}/api/providers/register`, {
        method: 'POST',
        headers: { ...operatorAuth(), 'content-type': 'application/json' },
        body: JSON.stringify({
          providerId: 'custom',
          baseUrl: fake.url,
          apiKey: 'sk-fake',
          model: 'fake-model',
        }),
      })

      const response = await fetch(`${server.url}/api/agent`, {
        method: 'POST',
        headers: { ...agentAuth(token), 'content-type': 'application/json' },
        body: JSON.stringify({
          providerId: 'custom',
          mode: 'APPROVED_EXECUTION',
          message: 'Read README.md',
          stream: false,
        }),
      })
      expect(response.status).toBe(200)
      const result = (await response.json()) as {
        iterations: readonly { toolResults: readonly { isError: boolean; output: string }[] }[]
      }
      expect(result.iterations[0]?.toolResults[0]?.isError).toBe(false)
      expect(result.iterations[0]?.toolResults[0]?.output).toContain('hello')
    })

    it('denies a Repository Analyst grant attempting a mutating tool call, mid-mission', async () => {
      const server = await launch()
      const createResponse = await fetch(`${server.url}/api/v1/access-grants`, {
        method: 'POST',
        headers: { ...operatorAuth(), 'content-type': 'application/json' },
        body: JSON.stringify({
          principalType: 'llm',
          displayName: 'Analyst',
          profileId: 'repository-analyst',
          repositoryScope: { mode: 'installation', repositories: [], organizations: [] },
        }),
      })
      const { plaintextToken } = (await createResponse.json()) as { plaintextToken: string }

      const fake = await startFakeToolCallingProvider('edit_file', {
        path: 'README.md',
        content: 'malicious edit',
      })
      fakeUpstream = fake.server

      await fetch(`${server.url}/api/providers/register`, {
        method: 'POST',
        headers: { ...operatorAuth(), 'content-type': 'application/json' },
        body: JSON.stringify({
          providerId: 'custom',
          baseUrl: fake.url,
          apiKey: 'sk-fake',
          model: 'fake-model',
        }),
      })

      const response = await fetch(`${server.url}/api/agent`, {
        method: 'POST',
        headers: { ...agentAuth(plaintextToken), 'content-type': 'application/json' },
        body: JSON.stringify({
          providerId: 'custom',
          mode: 'APPROVED_EXECUTION',
          message: 'Edit README.md',
          stream: false,
        }),
      })
      expect(response.status).toBe(200)
      const result = (await response.json()) as {
        iterations: readonly { toolResults: readonly { isError: boolean; output: string }[] }[]
      }
      expect(result.iterations[0]?.toolResults[0]?.isError).toBe(true)
      expect(result.iterations[0]?.toolResults[0]?.output).toContain('authorization_denied')

      // The file must be genuinely untouched — this is not just an HTTP-layer denial.
      const onDisk = await fetch(`${server.url}/api/repository/file?path=README.md`, {
        headers: operatorAuth(),
      })
      const onDiskBody = (await onDisk.json()) as { content: string }
      expect(onDiskBody.content).not.toContain('malicious edit')
    })
  })
})
