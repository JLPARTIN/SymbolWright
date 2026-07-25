import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { ProviderRuntimeOverrideStore } from '../providers/provider-runtime-overrides.js'
import { startChatServer, type StartedChatServer } from './symbolwright-chat-server.js'
import { UnlimitedRateLimiter } from './rate-limiter.js'

const API_KEY = 'mission-agent-key'

function startFakeOpenAiServer(): Promise<{ readonly server: Server; readonly url: string }> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(
      'data: {"choices":[{"delta":{"content":"Mission answer"},"finish_reason":"stop"}]}\n\n',
    )
    res.write('data: {"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":2}}\n\n')
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

function auth(): Record<string, string> {
  return { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' }
}

describe('mission-aware agent endpoint', () => {
  const roots: string[] = []
  const servers: StartedChatServer[] = []
  const upstreams: Server[] = []

  afterEach(async () => {
    for (const started of servers.splice(0)) {
      await new Promise<void>((resolve) => started.server.close(() => resolve()))
    }
    for (const server of upstreams.splice(0)) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  it('keeps non-mission requests backward compatible and resumes mission conversation after restart', async () => {
    const root = mkdtempSync(join(tmpdir(), 'symbolwright-agent-mission-'))
    roots.push(root)
    const upstream = await startFakeOpenAiServer()
    upstreams.push(upstream.server)
    const overrideStore = new ProviderRuntimeOverrideStore()
    overrideStore.set('custom', {
      baseUrl: upstream.url,
      apiKey: 'provider-secret',
      model: 'fake-model',
    })

    const start = async () => {
      const server = await startChatServer({
        apiKey: API_KEY,
        host: '127.0.0.1',
        port: 0,
        cwd: root,
        env: {},
        overrideStore,
        rateLimiter: new UnlimitedRateLimiter(),
      })
      servers.push(server)
      return server
    }

    const first = await start()
    const ordinary = await fetch(`${first.url}/api/agent`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ providerId: 'custom', message: 'ordinary', stream: false }),
    })
    expect(ordinary.status).toBe(200)

    const createdResponse = await fetch(`${first.url}/api/missions`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        name: 'Restart proof',
        objective: 'Resume after restart',
        workspaceKind: 'repository',
        repositoryPath: '.',
        runtimeMode: 'READ_ONLY',
        activeProviderId: 'custom',
        model: 'fake-model',
      }),
    })
    const created = (await createdResponse.json()) as { mission: { id: string } }

    const missionTurn = await fetch(`${first.url}/api/agent`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        providerId: 'custom',
        missionId: created.mission.id,
        message: 'remember this',
        stream: false,
        mode: 'READ_ONLY',
      }),
    })
    expect(missionTurn.status).toBe(200)

    await new Promise<void>((resolve) => first.server.close(() => resolve()))
    servers.splice(servers.indexOf(first), 1)

    const second = await start()
    const reloadedResponse = await fetch(`${second.url}/api/missions/${created.mission.id}`, {
      headers: auth(),
    })
    expect(reloadedResponse.status).toBe(200)
    const reloaded = (await reloadedResponse.json()) as {
      mission: {
        agent: { messages: readonly unknown[]; activeProviderId?: string; model?: string }
      }
    }
    expect(reloaded.mission.agent.messages.length).toBeGreaterThanOrEqual(2)
    expect(reloaded.mission.agent.activeProviderId).toBe('custom')
    expect(reloaded.mission.agent.model).toBe('fake-model')
    expect(JSON.stringify(reloaded)).not.toContain('provider-secret')
  })
})
