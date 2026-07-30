import { mkdtempSync, rmSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MissionService } from '../../mission/mission-service.js'
import { clearApplicationSandboxNetworkRuntimesForTests } from '../../sandbox/sandbox-network-runtime.js'
import { SandboxService } from '../../sandbox/sandbox-service.js'
import { handleSandboxRoute } from './sandbox-routes.js'

let root: string

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'symbolwright-dependency-route-'))
})

afterEach(() => {
  clearApplicationSandboxNetworkRuntimesForTests()
  rmSync(root, { recursive: true, force: true })
})

describe('governed dependency HTTP route', () => {
  it('requires a server-resolved mission identity', async () => {
    const res = response()
    await handleSandboxRoute(
      request('POST', {}),
      res,
      new URL('http://localhost/api/sandbox/dependencies/npm'),
      { service: new SandboxService({ workspaceRoot: root }), repositoryId: root },
    )

    expect(res.statusCode).toBe(400)
    expect(res.json<{ error: string }>().error).toContain('missionId is required')
  })

  it('fails closed when no operator dependency policy is configured', async () => {
    const missionService = new MissionService({ workspaceRoot: root })
    const mission = await missionService.create({
      name: 'Dependency route mission',
      objective: 'Prove dependency acquisition fails closed without operator policy',
      workspaceKind: 'repository',
      repositoryPath: '.',
      runtimeMode: 'APPROVED_EXECUTION',
      labels: [],
    })
    const res = response()

    await handleSandboxRoute(
      request('POST', { missionId: mission.id }),
      res,
      new URL('http://localhost/api/sandbox/dependencies/npm'),
      {
        service: new SandboxService({ workspaceRoot: root }),
        missionService,
        repositoryId: root,
      },
    )

    expect(res.statusCode).toBe(403)
    expect(res.json<{ reasonCode: string }>().reasonCode).toBe(
      'DEPENDENCY_POLICY_REFERENCE_REQUIRED',
    )
  })
})

function request(method: string, body: unknown): IncomingMessage {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]) as IncomingMessage
  Object.assign(req, { method })
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
