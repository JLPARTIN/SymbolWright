import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { startChatServer, type StartedChatServer } from './codemind-chat-server.js'
import { UnlimitedRateLimiter } from './rate-limiter.js'

const API_KEY = 'sandbox-server-test-key'

let root: string
let started: StartedChatServer | undefined

function auth(): Record<string, string> {
  return { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' }
}

async function createMission(): Promise<{ readonly id: string }> {
  const response = await fetch(`${started!.url}/api/missions`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({
      name: 'Sandbox server mission',
      objective: 'Record sandbox execution evidence from the real server route.',
      workspaceKind: 'repository',
      repositoryPath: '.',
      runtimeMode: 'APPROVED_EXECUTION',
    }),
  })
  expect(response.status).toBe(201)
  const body = (await response.json()) as { mission: { id: string } }
  return body.mission
}

describe('codemind chat server sandbox routes', () => {
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'codemind-sandbox-server-'))
    started = await startChatServer({
      apiKey: API_KEY,
      host: '127.0.0.1',
      port: 0,
      cwd: root,
      env: {},
      rateLimiter: new UnlimitedRateLimiter(),
    })
  })

  afterEach(async () => {
    if (started !== undefined) {
      await new Promise<void>((resolve) => started!.server.close(() => resolve()))
      started = undefined
    }
    rmSync(root, { recursive: true, force: true })
  })

  it('requires authentication for sandbox inventory and execution routes', async () => {
    expect((await fetch(`${started!.url}/api/sandbox/runtimes`)).status).toBe(401)
    expect(
      (
        await fetch(`${started!.url}/api/sandbox/execute`, {
          method: 'POST',
          body: JSON.stringify({ languageId: 'javascript', mode: 'run', source: '1' }),
        })
      ).status,
    ).toBe(401)
  })

  it('serves runtime inventory from the real unified server', async () => {
    const response = await fetch(`${started!.url}/api/sandbox/runtimes`, { headers: auth() })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      schemaVersion: number
      runners: readonly { id: string; trustClass: string }[]
    }
    expect(body.schemaVersion).toBe(1)
    expect(body.runners.some((runner) => runner.trustClass === 'browser-isolated')).toBe(true)
  })

  it('persists policy-controlled execution history through the real server route', async () => {
    const execute = await fetch(`${started!.url}/api/sandbox/execute`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        languageId: 'javascript',
        mode: 'run',
        source: 'console.log("hello from sandbox route")',
        runtimeMode: 'APPROVED_EXECUTION',
      }),
    })
    expect(execute.status).toBe(200)
    const executed = (await execute.json()) as {
      result: { executionId: string; status: string; evidence: { inputHash: string } }
    }
    expect(executed.result.status).toBe('policy-blocked')
    expect(executed.result.evidence.inputHash).toMatch(/^[a-f0-9]{64}$/)

    const list = await fetch(`${started!.url}/api/sandbox/executions`, { headers: auth() })
    expect(list.status).toBe(200)
    const history = (await list.json()) as {
      executions: readonly { executionId: string; status: string }[]
    }
    expect(history.executions[0]?.executionId).toBe(executed.result.executionId)

    const detail = await fetch(
      `${started!.url}/api/sandbox/executions/${executed.result.executionId}`,
      { headers: auth() },
    )
    expect(detail.status).toBe(200)
    const record = (await detail.json()) as { execution: { executionId: string } }
    expect(record.execution.executionId).toBe(executed.result.executionId)
  })

  it('records mission evidence through the wired sandbox route', async () => {
    const mission = await createMission()
    const execute = await fetch(`${started!.url}/api/sandbox/execute`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        languageId: 'javascript',
        mode: 'run',
        source: 'console.log("mission evidence")',
        runtimeMode: 'APPROVED_EXECUTION',
        missionId: mission.id,
      }),
    })
    expect(execute.status).toBe(200)

    const events = await fetch(`${started!.url}/api/missions/${mission.id}/events`, {
      headers: auth(),
    })
    expect(events.status).toBe(200)
    const body = (await events.json()) as { events: readonly { type: string }[] }
    expect(body.events.some((event) => event.type === 'sandbox.execution.blocked')).toBe(true)
  })

  it('returns structured sandbox errors and cancel status from the real server route', async () => {
    const bad = await fetch(`${started!.url}/api/sandbox/execute`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ languageId: 'javascript', mode: 'run' }),
    })
    expect(bad.status).toBe(400)
    const errorBody = (await bad.json()) as { error: string }
    expect(errorBody.error).toContain('source mode')

    const cancel = await fetch(`${started!.url}/api/sandbox/cancel/sandbox_missing`, {
      method: 'POST',
      headers: auth(),
    })
    expect(cancel.status).toBe(202)
    const cancelBody = (await cancel.json()) as { status: string }
    expect(cancelBody.status).toBe('not_running')
  })
})
