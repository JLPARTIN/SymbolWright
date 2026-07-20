import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { startChatServer, type StartedChatServer } from '../../server/codemind-chat-server.js'
import { UnlimitedRateLimiter } from '../../server/rate-limiter.js'

const API_KEY = 'mission-api-test-key'
let root: string
let started: StartedChatServer | undefined

function auth(): Record<string, string> {
  return { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' }
}

async function createMission() {
  const response = await fetch(`${started!.url}/api/missions`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({
      name: 'Mission API', objective: 'Persist it', workspaceKind: 'repository',
      repositoryPath: '.', runtimeMode: 'READ_ONLY',
    }),
  })
  expect(response.status).toBe(201)
  return (await response.json()) as { mission: { id: string; revision: number; status: string } }
}

describe('mission API routes', () => {
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'codemind-mission-api-'))
    started = await startChatServer({
      apiKey: API_KEY, host: '127.0.0.1', port: 0, cwd: root,
      env: {}, rateLimiter: new UnlimitedRateLimiter(),
    })
  })

  afterEach(async () => {
    if (started) await new Promise<void>((resolve) => started!.server.close(() => resolve()))
    started = undefined
    rmSync(root, { recursive: true, force: true })
  })

  it('requires authentication for all mission routes', async () => {
    expect((await fetch(`${started!.url}/api/missions`)).status).toBe(401)
    expect((await fetch(`${started!.url}/api/missions/import`, { method: 'POST' })).status).toBe(401)
  })

  it('creates, lists, reads, updates, pauses, resumes, exports, imports, and deletes', async () => {
    const created = await createMission()
    const id = created.mission.id

    expect((await fetch(`${started!.url}/api/missions`, { headers: auth() })).status).toBe(200)
    const read = await fetch(`${started!.url}/api/missions/${id}`, { headers: auth() })
    expect(read.status).toBe(200)

    const patch = await fetch(`${started!.url}/api/missions/${id}`, {
      method: 'PATCH', headers: auth(),
      body: JSON.stringify({ revision: created.mission.revision, name: 'Renamed' }),
    })
    expect(patch.status).toBe(200)
    const patched = (await patch.json()) as { mission: { revision: number } }

    const stale = await fetch(`${started!.url}/api/missions/${id}`, {
      method: 'PATCH', headers: auth(),
      body: JSON.stringify({ revision: created.mission.revision, name: 'Stale' }),
    })
    expect(stale.status).toBe(409)

    const pause = await fetch(`${started!.url}/api/missions/${id}/pause`, {
      method: 'POST', headers: auth(), body: JSON.stringify({ revision: patched.mission.revision }),
    })
    const paused = (await pause.json()) as { mission: { revision: number; status: string } }
    expect(paused.mission.status).toBe('PAUSED')

    const resume = await fetch(`${started!.url}/api/missions/${id}/resume`, {
      method: 'POST', headers: auth(), body: JSON.stringify({ revision: paused.mission.revision }),
    })
    const resumed = (await resume.json()) as { mission: { revision: number; status: string } }
    expect(resumed.mission.status).toBe('ACTIVE')

    const exported = await fetch(`${started!.url}/api/missions/${id}/export`, {
      method: 'POST', headers: auth(),
    })
    expect(exported.status).toBe(200)
    const bundle = await exported.json()

    const importedResponse = await fetch(`${started!.url}/api/missions/import`, {
      method: 'POST', headers: auth(), body: JSON.stringify({ bundle }),
    })
    expect(importedResponse.status).toBe(201)
    const imported = (await importedResponse.json()) as { mission: { id: string; status: string } }
    expect(imported.mission.id).not.toBe(id)
    expect(imported.mission.status).toBe('PAUSED')

    expect((await fetch(`${started!.url}/api/missions/${id}`, {
      method: 'DELETE', headers: auth(), body: JSON.stringify({ revision: resumed.mission.revision, confirm: false }),
    })).status).toBe(409)
    expect((await fetch(`${started!.url}/api/missions/${id}`, {
      method: 'DELETE', headers: auth(), body: JSON.stringify({ revision: resumed.mission.revision, confirm: true }),
    })).status).toBe(200)
  })

  it('rejects malformed payloads and returns 404 for missing missions', async () => {
    expect((await fetch(`${started!.url}/api/missions`, {
      method: 'POST', headers: auth(), body: '{bad',
    })).status).toBe(400)
    expect((await fetch(`${started!.url}/api/missions/mission_99999999-9999-4999-8999-999999999999`, {
      headers: auth(),
    })).status).toBe(404)
  })
})
