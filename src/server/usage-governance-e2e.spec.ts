import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { ProviderConcurrencyGuard } from '../access/provider-concurrency-guard.js'
import { parseMicrodollars } from '../access/microdollars.js'
import { startChatServer, type StartedChatServer } from './symbolwright-chat-server.js'
import { UnlimitedRateLimiter } from './rate-limiter.js'

const API_KEY = 'usage-governance-e2e-key'

function startFakeOpenAiServer(usage: {
  promptTokens: number
  completionTokens: number
}): Promise<{ readonly server: Server; readonly url: string }> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: {"choices":[{"delta":{"content":"Answer"},"finish_reason":"stop"}]}\n\n')
    res.write(
      `data: {"choices":[],"usage":{"prompt_tokens":${usage.promptTokens},"completion_tokens":${usage.completionTokens}}}\n\n`,
    )
    res.write('data: [DONE]\n\n')
    res.end()
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      resolve({ server, url: `http://127.0.0.1:${port}/v1` })
    })
  })
}

function operatorAuth(): Record<string, string> {
  return { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' }
}

function agentAuth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

async function createCodingAgentGrant(
  server: StartedChatServer,
  overrides: Record<string, unknown> = {},
): Promise<{ grantId: string; token: string }> {
  const response = await fetch(`${server.url}/api/v1/access-grants`, {
    method: 'POST',
    headers: operatorAuth(),
    body: JSON.stringify({
      principalType: 'coding-agent',
      displayName: 'Usage Governance Agent',
      profileId: 'coding-agent',
      repositoryScope: { mode: 'installation', repositories: [], organizations: [] },
      ...overrides,
    }),
  })
  expect(response.status).toBe(201)
  const body = (await response.json()) as { grant: { id: string }; plaintextToken: string }
  return { grantId: body.grant.id, token: body.plaintextToken }
}

describe('usage governance — end to end', () => {
  const roots: string[] = []
  const servers: StartedChatServer[] = []
  const upstreams: Server[] = []

  afterEach(async () => {
    for (const started of servers.splice(0)) {
      await new Promise<void>((resolve) => started.server.close(() => resolve()))
    }
    for (const upstream of upstreams.splice(0)) {
      await new Promise<void>((resolve) => upstream.close(() => resolve()))
    }
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  async function launch(
    overrides: Partial<Parameters<typeof startChatServer>[0]> = {},
  ): Promise<StartedChatServer> {
    const root = mkdtempSync(join(tmpdir(), 'symbolwright-usage-governance-'))
    roots.push(root)
    const server = await startChatServer({
      apiKey: API_KEY,
      host: '127.0.0.1',
      port: 0,
      cwd: root,
      env: {},
      rateLimiter: new UnlimitedRateLimiter(),
      ...overrides,
    })
    servers.push(server)
    return server
  }

  async function registerFakeProvider(server: StartedChatServer, url: string): Promise<void> {
    const response = await fetch(`${server.url}/api/providers/register`, {
      method: 'POST',
      headers: operatorAuth(),
      body: JSON.stringify({
        providerId: 'custom',
        baseUrl: url,
        apiKey: 'sk-fake',
        model: 'fake-model',
      }),
    })
    expect(response.status).toBe(200)
  }

  it('records mission usage/cost from a real agent turn (previously dropped on the floor entirely)', async () => {
    const server = await launch()
    const fake = await startFakeOpenAiServer({
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
    })
    upstreams.push(fake.server)
    await registerFakeProvider(server, fake.url)

    const createdResponse = await fetch(`${server.url}/api/missions`, {
      method: 'POST',
      headers: operatorAuth(),
      body: JSON.stringify({
        name: 'Usage capture proof',
        objective: 'Prove usage is captured',
        workspaceKind: 'repository',
        repositoryPath: '.',
        runtimeMode: 'READ_ONLY',
      }),
    })
    expect(createdResponse.status).toBe(201)
    const created = (await createdResponse.json()) as { mission: { id: string } }

    const turnResponse = await fetch(`${server.url}/api/agent`, {
      method: 'POST',
      headers: operatorAuth(),
      body: JSON.stringify({
        providerId: 'custom',
        missionId: created.mission.id,
        model: 'claude-sonnet-4-20250514',
        message: 'hi',
        stream: false,
        mode: 'READ_ONLY',
      }),
    })
    expect(turnResponse.status).toBe(200)

    const reloadedResponse = await fetch(`${server.url}/api/missions/${created.mission.id}`, {
      headers: operatorAuth(),
    })
    const reloaded = (await reloadedResponse.json()) as {
      mission: {
        usage?: {
          totalPromptUnits: number
          totalCompletionUnits: number
          totalCostMicrodollars: string
        }
      }
    }

    expect(reloaded.mission.usage?.totalPromptUnits).toBe(1_000_000)
    expect(reloaded.mission.usage?.totalCompletionUnits).toBe(1_000_000)
    expect(parseMicrodollars(reloaded.mission.usage!.totalCostMicrodollars)).toBe(
      3_000_000n + 15_000_000n,
    )
  })

  it('rejects an agent turn with status budget_exceeded once the calling grant is over its configured daily cost cap', async () => {
    const server = await launch()
    const fake = await startFakeOpenAiServer({ promptTokens: 10, completionTokens: 10 })
    upstreams.push(fake.server)
    await registerFakeProvider(server, fake.url)

    const { token } = await createCodingAgentGrant(server, {
      executionLimits: { maxDailyEstimatedCostUsd: 0 },
    })

    const response = await fetch(`${server.url}/api/agent`, {
      method: 'POST',
      headers: agentAuth(token),
      body: JSON.stringify({
        providerId: 'custom',
        model: 'claude-sonnet-4-20250514',
        message: 'hi',
        stream: false,
        mode: 'READ_ONLY',
      }),
    })

    expect(response.status).toBe(200)
    const result = (await response.json()) as { status: string; error?: string }
    expect(result.status).toBe('budget_exceeded')
    expect(result.error).toMatch(/exceeding the configured cap/)
  })

  it('allows an agent turn from a grant with no configured cost cap, unchanged', async () => {
    const server = await launch()
    const fake = await startFakeOpenAiServer({ promptTokens: 10, completionTokens: 10 })
    upstreams.push(fake.server)
    await registerFakeProvider(server, fake.url)

    const { token } = await createCodingAgentGrant(server)

    const response = await fetch(`${server.url}/api/agent`, {
      method: 'POST',
      headers: agentAuth(token),
      body: JSON.stringify({
        providerId: 'custom',
        model: 'claude-sonnet-4-20250514',
        message: 'hi',
        stream: false,
        mode: 'READ_ONLY',
      }),
    })

    expect(response.status).toBe(200)
    const result = (await response.json()) as { status: string }
    expect(result.status).toBe('completed')
  })

  it('responds 429 once the injected provider concurrency pool is already at capacity', async () => {
    const concurrencyGuard = new ProviderConcurrencyGuard({ provider: { limit: 0 } })
    const server = await launch({ concurrencyGuard })
    const fake = await startFakeOpenAiServer({ promptTokens: 10, completionTokens: 10 })
    upstreams.push(fake.server)
    await registerFakeProvider(server, fake.url)

    const response = await fetch(`${server.url}/api/agent`, {
      method: 'POST',
      headers: operatorAuth(),
      body: JSON.stringify({
        providerId: 'custom',
        message: 'hi',
        stream: false,
        mode: 'READ_ONLY',
      }),
    })

    expect(response.status).toBe(429)
  })

  it('responds 429 for an SSE request once the injected sse concurrency pool is already at capacity', async () => {
    const concurrencyGuard = new ProviderConcurrencyGuard({ sse: { limit: 0 } })
    const server = await launch({ concurrencyGuard })
    const fake = await startFakeOpenAiServer({ promptTokens: 10, completionTokens: 10 })
    upstreams.push(fake.server)
    await registerFakeProvider(server, fake.url)

    const response = await fetch(`${server.url}/api/agent`, {
      method: 'POST',
      headers: operatorAuth(),
      body: JSON.stringify({
        providerId: 'custom',
        message: 'hi',
        stream: true,
        mode: 'READ_ONLY',
      }),
    })

    expect(response.status).toBe(429)
  })
})
