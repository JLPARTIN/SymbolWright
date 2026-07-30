import type { IncomingMessage, ServerResponse } from 'node:http'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MissionService } from '../../mission/mission-service.js'
import { handleMissionRoute, type MissionRouteContext } from './mission-routes.js'

let cwd: string
let service: MissionService
let missionId: string

beforeEach(async () => {
  cwd = await mkdtemp(path.join(tmpdir(), 'symbolwright-mission-operation-matrix-'))
  service = new MissionService({ workspaceRoot: cwd, env: {} })
  const mission = await service.create(
    {
      name: 'Operation matrix mission',
      objective: 'Exercise route operation mapping without mutating the mission.',
      workspaceKind: 'repository',
      repositoryPath: cwd,
      runtimeMode: 'READ_ONLY',
      labels: [],
    },
    { grantId: 'grant-owner' },
  )
  missionId = mission.id
})

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true })
})

describe('mission route operation matrix', () => {
  it.each(['start', 'resume', 'pause', 'retry'])(
    'maps autonomy/%s POST to execute authorization',
    async (action) => {
      await expectStatus('POST', `/api/missions/${missionId}/autonomy/${action}`, 404)
    },
  )

  it.each(['cancel', 'release'])(
    'maps autonomy/%s POST to manage authorization',
    async (action) => {
      await expectStatus('POST', `/api/missions/${missionId}/autonomy/${action}`, 404)
    },
  )

  it.each([
    ['GET', 'events'],
    ['POST', 'export'],
  ])('maps %s /%s to read authorization', async (method, action) => {
    await expectStatus(method, `/api/missions/${missionId}/${action}`, 404)
  })

  it('maps POST /record to contribute authorization', async () => {
    await expectStatus('POST', `/api/missions/${missionId}/record`, 404)
  })

  it.each([
    'pause',
    'resume',
    'complete',
    'abandon',
    'reopen',
    'attach-scratch',
    'switch-recorded-branch',
    'checkpoint-label',
  ])('maps POST /%s to manage authorization', async (action) => {
    await expectStatus('POST', `/api/missions/${missionId}/${action}`, 404)
  })

  it.each([
    ['POST', `/api/missions/${missionId}/autonomy`],
    ['GET', `/api/missions/${missionId}/autonomy/resume`],
    ['POST', `/api/missions/${missionId}/events`],
    ['GET', `/api/missions/${missionId}/export`],
    ['GET', `/api/missions/${missionId}/record`],
    ['GET', `/api/missions/${missionId}/pause`],
  ])('skips ownership lookup for method mismatch %s %s', async (method, pathname) => {
    await expectStatus(method, pathname, 405)
  })

  it('maps direct mission GET, PATCH, and DELETE to distinct ownership operations', async () => {
    await expectStatus('GET', `/api/missions/${missionId}`, 404)
    await expectStatus('PATCH', `/api/missions/${missionId}`, 404)
    await expectStatus('DELETE', `/api/missions/${missionId}`, 404)
  })
})

async function expectStatus(method: string, pathname: string, expected: number): Promise<void> {
  const output = response()
  const handled = await handleMissionRoute(
    request(method),
    output.res,
    new URL(`http://localhost${pathname}`),
    context(),
  )

  expect(handled).toBe(true)
  expect(output.status()).toBe(expected)
}

function request(method: string): IncomingMessage {
  return {
    method,
    [Symbol.asyncIterator]: () => [][Symbol.iterator](),
  } as unknown as IncomingMessage
}

function response(): { readonly res: ServerResponse; readonly status: () => number } {
  let status = 0
  const res = {
    writeHead: vi.fn((code: number) => {
      status = code
    }),
    end: vi.fn(),
  } as unknown as ServerResponse
  return { res, status: () => status }
}

function context(): MissionRouteContext {
  return { service, cwd, grantId: 'grant-outsider' }
}
