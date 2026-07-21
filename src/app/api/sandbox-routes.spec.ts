import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MissionService } from '../../mission/mission-service.js'
import { SandboxHistoryStore } from '../../sandbox/sandbox-history.js'
import { SandboxService } from '../../sandbox/sandbox-service.js'
import { handleSandboxRoute } from './sandbox-routes.js'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'codemind-sandbox-route-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function request(method: string, body?: unknown): IncomingMessage {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  const req = Readable.from(chunks) as IncomingMessage
  Object.assign(req, { method })
  return req
}

class MockResponse {
  public statusCode = 0
  public body = ''
  public headers: Record<string, string> = {}

  public writeHead(statusCode: number, headers: Record<string, string> = {}): this {
    this.statusCode = statusCode
    this.headers = { ...this.headers, ...headers }
    return this
  }

  public end(chunk?: string | Buffer): this {
    if (chunk !== undefined) this.body += chunk.toString()
    return this
  }

  public json<T>(): T {
    return JSON.parse(this.body) as T
  }
}

function response(): MockResponse & ServerResponse {
  return new MockResponse() as MockResponse & ServerResponse
}

function services() {
  const historyStore = new SandboxHistoryStore({ workspaceRoot: root, env: { SECRET_TOKEN: 'secret' } })
  const sandboxService = new SandboxService({
    historyStore,
    env: { SECRET_TOKEN: 'secret' },
    generateExecutionId: () => 'sandbox_route_test',
  })
  const missionService = new MissionService({
    workspaceRoot: root,
    env: { SECRET_TOKEN: 'secret' },
    generateId: () => 'mission_route_test',
  })
  return { sandboxService, missionService }
}

describe('sandbox API route handler', () => {
  it('lists runtime inventory and rejects unsupported methods', async () => {
    const { sandboxService } = services()
    const res = response()

    expect(
      await handleSandboxRoute(request('GET'), res, new URL('http://localhost/api/sandbox/runtimes'), {
        service: sandboxService,
      }),
    ).toBe(true)
    expect(res.statusCode).toBe(200)
    expect(res.json<{ schemaVersion: number }>().schemaVersion).toBe(1)

    const rejected = response()
    await handleSandboxRoute(
      request('POST'),
      rejected,
      new URL('http://localhost/api/sandbox/runtimes'),
      { service: sandboxService },
    )
    expect(rejected.statusCode).toBe(405)
  })

  it('executes through the structured policy layer, persists history, and records mission evidence', async () => {
    const { sandboxService, missionService } = services()
    const mission = await missionService.create({
      name: 'Sandbox route mission',
      objective: 'Record sandbox evidence',
      workspaceKind: 'repository',
      repositoryPath: '.',
      runtimeMode: 'APPROVED_EXECUTION',
      labels: [],
    })

    const execute = response()
    await handleSandboxRoute(
      request('POST', {
        languageId: 'javascript',
        mode: 'run',
        source: 'console.log("secret")',
        runtimeMode: 'APPROVED_EXECUTION',
        missionId: mission.id,
      }),
      execute,
      new URL('http://localhost/api/sandbox/execute'),
      { service: sandboxService, missionService },
    )

    expect(execute.statusCode).toBe(200)
    const body = execute.json<{ result: { executionId: string; status: string; evidence: { inputHash: string } } }>()
    expect(body.result.executionId).toBe('sandbox_route_test')
    expect(body.result.status).toBe('policy-blocked')
    expect(body.result.evidence.inputHash).toMatch(/^[a-f0-9]{64}$/)

    const history = response()
    await handleSandboxRoute(
      request('GET'),
      history,
      new URL('http://localhost/api/sandbox/executions'),
      { service: sandboxService },
    )
    expect(history.statusCode).toBe(200)
    expect(history.json<{ executions: readonly { executionId: string }[] }>().executions[0]?.executionId).toBe(
      'sandbox_route_test',
    )

    const events = missionService.readEvents(mission.id)
    expect(events.some((event) => event.type === 'sandbox.execution.blocked')).toBe(true)
  })

  it('returns structured errors for malformed payloads and missing execution records', async () => {
    const { sandboxService } = services()

    const bad = response()
    await handleSandboxRoute(
      request('POST', { languageId: 'javascript', mode: 'run' }),
      bad,
      new URL('http://localhost/api/sandbox/execute'),
      { service: sandboxService },
    )
    expect(bad.statusCode).toBe(400)

    const missing = response()
    await handleSandboxRoute(
      request('GET'),
      missing,
      new URL('http://localhost/api/sandbox/executions/not-found'),
      { service: sandboxService },
    )
    expect(missing.statusCode).toBe(404)
  })
})
