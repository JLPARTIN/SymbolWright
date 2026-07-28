import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

import { describe, expect, it } from 'vitest'

import { buildSandboxInventory } from '../../sandbox/sandbox-registry.js'
import { SandboxService } from '../../sandbox/sandbox-service.js'
import { handleSandboxRoute } from './sandbox-routes.js'

const CHECKED_AT = '2026-07-28T00:00:00.000Z'

function request(body: unknown): IncomingMessage {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]) as IncomingMessage
  Object.assign(req, { method: 'POST' })
  return req
}

class MockResponse {
  public statusCode = 0
  public body = ''

  public writeHead(statusCode: number): this {
    this.statusCode = statusCode
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

function service(): SandboxService {
  return new SandboxService({
    env: {},
    inventory: buildSandboxInventory({
      env: {},
      commandAvailability: new Map(),
      now: () => new Date(CHECKED_AT),
    }),
  })
}

async function execute(body: unknown): Promise<MockResponse> {
  const res = response()
  await handleSandboxRoute(
    request(body),
    res,
    new URL('http://localhost/api/sandbox/execute'),
    { service: service() },
  )
  return res
}

describe('sandbox route fail-closed boundary coverage', () => {
  it('rejects a non-string mission id before execution', async () => {
    const res = await execute({
      languageId: 'javascript',
      mode: 'run',
      source: 'console.log(1)',
      missionId: 42,
    })

    expect(res.statusCode).toBe(400)
    expect(res.json<{ error: string }>().error).toContain('missionId must be a string')
  })

  it('requires repository execution to have a mission-bound workspace', async () => {
    const res = await execute({
      languageId: 'javascript',
      mode: 'run',
      repository: { selectedPaths: ['src/index.js'] },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json<{ error: string }>().error).toContain(
      'Repository sandbox execution requires a missionId',
    )
  })

  it('rejects mission references when no mission service is configured', async () => {
    const res = await execute({
      languageId: 'javascript',
      mode: 'run',
      source: 'console.log(1)',
      missionId: 'mission_missing_service',
    })

    expect(res.statusCode).toBe(400)
    expect(res.json<{ error: string }>().error).toContain('no mission service is configured')
  })
})
