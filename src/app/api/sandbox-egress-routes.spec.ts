import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MissionService } from '../../mission/mission-service.js'
import { DEFAULT_EGRESS_POLICY_LIMITS } from '../../sandbox/egress-policy.js'
import {
  SANDBOX_NETWORK_POLICY_FILE_ENV,
  clearApplicationSandboxNetworkRuntimesForTests,
} from '../../sandbox/sandbox-network-runtime.js'
import { SandboxService } from '../../sandbox/sandbox-service.js'
import { handleSandboxRoute } from './sandbox-routes.js'

let root: string
const originalPolicyFileEnv = process.env[SANDBOX_NETWORK_POLICY_FILE_ENV]

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'symbolwright-egress-route-'))
})

afterEach(() => {
  clearApplicationSandboxNetworkRuntimesForTests()
  rmSync(root, { recursive: true, force: true })
  if (originalPolicyFileEnv === undefined) {
    delete process.env[SANDBOX_NETWORK_POLICY_FILE_ENV]
  } else {
    process.env[SANDBOX_NETWORK_POLICY_FILE_ENV] = originalPolicyFileEnv
  }
})

function writeDocsOnlyEgressPolicy(workspaceRoot: string): void {
  const policyFile = path.join(workspaceRoot, 'sandbox-network-policy.json')
  writeFileSync(
    policyFile,
    JSON.stringify({
      schemaVersion: 1,
      egressProfiles: [
        {
          id: 'docs-only',
          version: 1,
          enabled: true,
          deploymentModes: ['local'],
          callerKinds: ['operator'],
          allowedHosts: ['docs.example.com'],
          allowedMethods: ['GET', 'HEAD'],
          allowedRequestHeaders: ['accept'],
          allowedPorts: [443],
          redirectPolicy: 'same-host',
          credentialPolicy: 'none',
          requireTls: true,
          auditRetentionDays: 30,
          limits: DEFAULT_EGRESS_POLICY_LIMITS,
        },
      ],
      defaultEgressPolicy: { id: 'docs-only', version: 1 },
    }),
    { mode: 0o600 },
  )
  process.env[SANDBOX_NETWORK_POLICY_FILE_ENV] = policyFile
}

describe('governed egress HTTP route', () => {
  it('reaches the egress handler and rejects non-POST methods', async () => {
    const res = response()
    await handleSandboxRoute(request('GET'), res, new URL('http://localhost/api/sandbox/egress'), {
      service: new SandboxService({ workspaceRoot: root }),
      repositoryId: root,
    })

    expect(res.statusCode).toBe(405)
    expect(res.json<{ error: string }>().error).toBe('method_not_allowed')
  })

  it('requires a server-resolved mission identity', async () => {
    const res = response()
    await handleSandboxRoute(
      request('POST', {}),
      res,
      new URL('http://localhost/api/sandbox/egress'),
      { service: new SandboxService({ workspaceRoot: root }), repositoryId: root },
    )

    expect(res.statusCode).toBe(400)
    expect(res.json<{ error: string }>().error).toContain('missionId is required')
  })

  it('rejects invalid JSON bodies', async () => {
    const res = response()
    const req = Readable.from([Buffer.from('{not json')]) as IncomingMessage
    Object.assign(req, { method: 'POST' })
    await handleSandboxRoute(req, res, new URL('http://localhost/api/sandbox/egress'), {
      service: new SandboxService({ workspaceRoot: root }),
      repositoryId: root,
    })

    expect(res.statusCode).toBe(400)
    expect(res.json<{ error: string }>().error).toContain('valid JSON')
  })

  it('rejects caller-controlled authority fields in the body once an operator policy is configured', async () => {
    const missionService = new MissionService({ workspaceRoot: root })
    const mission = await missionService.create({
      name: 'Egress route mission',
      objective: 'Prove egress rejects caller-supplied authority fields',
      workspaceKind: 'repository',
      repositoryPath: '.',
      runtimeMode: 'APPROVED_EXECUTION',
      labels: [],
    })
    writeDocsOnlyEgressPolicy(mission.repository.rootPath)
    const res = response()
    await handleSandboxRoute(
      request('POST', {
        missionId: mission.id,
        url: 'https://docs.example.com/guide',
        grantId: 'x',
      }),
      res,
      new URL('http://localhost/api/sandbox/egress'),
      { service: new SandboxService({ workspaceRoot: root }), missionService, repositoryId: root },
    )

    expect(res.statusCode).toBe(400)
    expect(res.json<{ error: string }>().error).toContain('caller-controlled authority field')
  })

  it('404s on an unknown mission without revealing existence', async () => {
    const missionService = new MissionService({ workspaceRoot: root })
    const res = response()
    await handleSandboxRoute(
      request('POST', {
        missionId: 'mission_00000000-0000-4000-8000-000000000000',
        url: 'https://example.com',
      }),
      res,
      new URL('http://localhost/api/sandbox/egress'),
      { service: new SandboxService({ workspaceRoot: root }), missionService, repositoryId: root },
    )

    expect(res.statusCode).toBe(404)
  })

  it('fails closed when no operator egress policy is configured', async () => {
    const missionService = new MissionService({ workspaceRoot: root })
    const mission = await missionService.create({
      name: 'Egress route mission',
      objective: 'Prove egress fails closed without operator policy',
      workspaceKind: 'repository',
      repositoryPath: '.',
      runtimeMode: 'APPROVED_EXECUTION',
      labels: [],
    })
    const res = response()

    await handleSandboxRoute(
      request('POST', { missionId: mission.id, url: 'https://example.com' }),
      res,
      new URL('http://localhost/api/sandbox/egress'),
      {
        service: new SandboxService({ workspaceRoot: root }),
        missionService,
        repositoryId: root,
      },
    )

    expect(res.statusCode).toBe(403)
    expect(res.json<{ reasonCode: string }>().reasonCode).toBe('EGRESS_POLICY_REFERENCE_REQUIRED')
  })
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
