import { mkdtempSync, rmSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MissionService } from '../../mission/mission-service.js'
import { SandboxHistoryStore } from '../../sandbox/sandbox-history.js'
import { buildSandboxInventory, runnerAvailability } from '../../sandbox/sandbox-registry.js'
import { SandboxService } from '../../sandbox/sandbox-service.js'
import type { SandboxRunnerAvailability } from '../../sandbox/sandbox-types.js'
import { handleSandboxRoute } from './sandbox-routes.js'

const TEST_MISSION_ID = 'mission_99999999-9999-4999-8999-999999999999'
const CHECKED_AT = '2026-07-21T00:00:00.000Z'
const EXECUTION_ENV: NodeJS.ProcessEnv = {
  PATH: process.env['PATH'] ?? '',
  SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION: 'true',
  SYMBOLWRIGHT_SECRET_TOKEN: 'route-secret-token',
}

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'symbolwright-sandbox-route-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function availability(command: string): SandboxRunnerAvailability {
  return runnerAvailability('available', CHECKED_AT, { version: `${command} test` })
}

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
  const commandAvailability = new Map<string, SandboxRunnerAvailability>([
    ['node', availability('node')],
  ])
  const historyStore = new SandboxHistoryStore({
    workspaceRoot: root,
    env: EXECUTION_ENV,
  })
  const sandboxService = new SandboxService({
    historyStore,
    env: EXECUTION_ENV,
    generateExecutionId: () => 'sandbox_route_test',
    inventory: buildSandboxInventory({
      env: EXECUTION_ENV,
      commandAvailability,
      now: () => new Date(CHECKED_AT),
    }),
  })
  const missionService = new MissionService({
    workspaceRoot: root,
    env: EXECUTION_ENV,
    generateId: () => TEST_MISSION_ID,
  })
  return { sandboxService, missionService }
}

describe('sandbox API route handler', () => {
  it('lists runtime inventory and rejects unsupported methods', async () => {
    const { sandboxService } = services()
    const res = response()

    expect(
      await handleSandboxRoute(
        request('GET'),
        res,
        new URL('http://localhost/api/sandbox/runtimes'),
        { service: sandboxService },
      ),
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

  it('lists only explicit sandbox image allowlist entries', async () => {
    const { sandboxService } = services()
    const res = response()

    await handleSandboxRoute(request('GET'), res, new URL('http://localhost/api/sandbox/images'), {
      service: sandboxService,
    })

    expect(res.statusCode).toBe(200)
    const body = res.json<{
      images: readonly { id: string; image: string; enabled: boolean; installed?: boolean }[]
    }>()
    expect(body.images.map((image) => image.id)).toContain('python-3-12-slim')
    expect(body.images.every((image) => image.enabled === false)).toBe(true)
    expect(body.images.some((image) => image.image === 'evil/random:latest')).toBe(false)
  })

  it('uses server-derived policy, persists history, and records mission evidence', async () => {
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
        source: "console.log('browser-side-only')",
        runtimeMode: 'READ_ONLY',
        missionId: mission.id,
      }),
      execute,
      new URL('http://localhost/api/sandbox/execute'),
      { service: sandboxService, missionService, runtimeMode: 'APPROVED_EXECUTION' },
    )

    expect(execute.statusCode).toBe(200)
    const body = execute.json<{
      result: {
        executionId: string
        status: string
        stdout: string
        backend: string
        trustClass: string
        evidence: {
          inputHash: string
          verificationLevel: string
          policyDecision: string
          policyReason?: string
        }
      }
    }>()
    expect(body.result.executionId).toBe('sandbox_route_test')
    expect(body.result.status).toBe('policy-blocked')
    expect(body.result.stdout).toBe('')
    expect(body.result.backend).toBe('browser')
    expect(body.result.trustClass).toBe('browser-isolated')
    expect(body.result.evidence.inputHash).toMatch(/^[a-f0-9]{64}$/)
    expect(body.result.evidence.verificationLevel).toBe('UNVERIFIED')
    expect(body.result.evidence.policyDecision).toBe('blocked')
    expect(body.result.evidence.policyReason).toContain('browser runtime')

    const history = response()
    await handleSandboxRoute(
      request('GET'),
      history,
      new URL('http://localhost/api/sandbox/executions'),
      { service: sandboxService },
    )
    expect(history.statusCode).toBe(200)
    expect(
      history.json<{ executions: readonly { executionId: string }[] }>().executions[0]?.executionId,
    ).toBe('sandbox_route_test')

    const restarted = services()
    const persisted = restarted.sandboxService.getExecution('sandbox_route_test')
    expect(persisted?.result.status).toBe('policy-blocked')

    const events = restarted.missionService.readEvents(mission.id)
    const sandboxEvent = events.find((event) => event.type === 'sandbox.execution.blocked')
    expect(sandboxEvent).toBeDefined()
    expect(JSON.stringify(sandboxEvent?.payload)).toContain('sandbox_route_test')
    expect(JSON.stringify(sandboxEvent?.payload)).toContain('UNVERIFIED')
    expect(JSON.stringify(sandboxEvent?.payload)).not.toContain('route-secret-token')
  })

  it('rejects guarded-host HTTP execution and caller-selected repository roots', async () => {
    const { sandboxService, missionService } = services()
    const mission = await missionService.create({
      name: 'Sandbox boundary mission',
      objective: 'Prove the HTTP trust boundary',
      workspaceKind: 'repository',
      repositoryPath: '.',
      runtimeMode: 'APPROVED_EXECUTION',
      labels: [],
    })

    const guarded = response()
    await handleSandboxRoute(
      request('POST', {
        languageId: 'javascript',
        mode: 'run',
        requestedRunnerId: 'guarded-host-javascript',
        source: "console.log('must not run')",
        missionId: mission.id,
      }),
      guarded,
      new URL('http://localhost/api/sandbox/execute'),
      { service: sandboxService, missionService },
    )
    expect(guarded.statusCode).toBe(403)
    expect(guarded.json<{ reasonCode: string }>().reasonCode).toBe('GUARDED_HOST_HTTP_FORBIDDEN')

    const callerRoot = response()
    await handleSandboxRoute(
      request('POST', {
        languageId: 'javascript',
        mode: 'run',
        repository: { rootPath: '/etc', selectedPaths: ['passwd'] },
        missionId: mission.id,
      }),
      callerRoot,
      new URL('http://localhost/api/sandbox/execute'),
      { service: sandboxService, missionService },
    )
    expect(callerRoot.statusCode).toBe(400)
    expect(callerRoot.json<{ error: string }>().error).toContain(
      'repository.rootPath is server-controlled',
    )
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
