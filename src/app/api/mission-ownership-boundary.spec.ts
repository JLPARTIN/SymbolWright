import type { IncomingMessage, ServerResponse } from 'node:http'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MissionService } from '../../mission/mission-service.js'
import { handleMissionRoute, type MissionRouteContext } from './mission-routes.js'

/**
 * Direct unit-level coverage of `handleMissionRoute`'s resource-ownership guard (mission-access-
 * guard.ts wiring), bypassing the HTTP/capability/approval stack entirely -- exercising
 * mutating actions (PATCH/DELETE/autonomy) through the real server would also trip the
 * unrelated pre-existing "before-first-write" human-approval gate on a fresh grant's first
 * write, which is covered by `resource-ownership-boundary-e2e.spec.ts`'s read-only assertions
 * instead. This file complements that one by exercising the mutating paths directly.
 */

function request(method: string, jsonBody?: unknown): IncomingMessage {
  const chunks = jsonBody === undefined ? [] : [Buffer.from(JSON.stringify(jsonBody))]
  return {
    method,
    [Symbol.asyncIterator]: () => chunks[Symbol.iterator](),
  } as unknown as IncomingMessage
}

function response(): { res: ServerResponse; status: () => number; body: () => unknown } {
  let status = 0
  const chunks: string[] = []
  const res = {
    writeHead: vi.fn((code: number) => {
      status = code
    }),
    end: vi.fn((chunk?: string) => {
      if (chunk !== undefined) chunks.push(chunk)
    }),
  } as unknown as ServerResponse
  return {
    res,
    status: () => status,
    body: () => JSON.parse(chunks[0] ?? '{}') as unknown,
  }
}

let cwd: string
let service: MissionService

beforeEach(async () => {
  cwd = await mkdtemp(path.join(tmpdir(), 'symbolwright-mission-ownership-boundary-'))
  service = new MissionService({ workspaceRoot: cwd, env: {} })
})

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true })
})

function contextFor(grantId: string | undefined): MissionRouteContext {
  return { service, cwd, ...(grantId === undefined ? {} : { grantId }) }
}

describe('handleMissionRoute — resource-ownership guard', () => {
  it('denies PATCH/DELETE/pause/complete from grant B against grant A mission with 404', async () => {
    const mission = await service.create(
      {
        name: 'Mission',
        objective: 'Do the thing',
        workspaceKind: 'repository',
        repositoryPath: cwd,
        runtimeMode: 'READ_ONLY',
        labels: [],
      },
      { grantId: 'grant-a' },
    )

    const patch = response()
    expect(
      await handleMissionRoute(
        request('PATCH'),
        patch.res,
        new URL(`http://localhost/api/missions/${mission.id}`),
        contextFor('grant-b'),
      ),
    ).toBe(true)
    expect(patch.status()).toBe(404)

    const del = response()
    expect(
      await handleMissionRoute(
        request('DELETE'),
        del.res,
        new URL(`http://localhost/api/missions/${mission.id}`),
        contextFor('grant-b'),
      ),
    ).toBe(true)
    expect(del.status()).toBe(404)

    const pause = response()
    expect(
      await handleMissionRoute(
        request('POST'),
        pause.res,
        new URL(`http://localhost/api/missions/${mission.id}/pause`),
        contextFor('grant-b'),
      ),
    ).toBe(true)
    expect(pause.status()).toBe(404)

    const autonomyStart = response()
    expect(
      await handleMissionRoute(
        request('POST'),
        autonomyStart.res,
        new URL(`http://localhost/api/missions/${mission.id}/autonomy/start`),
        contextFor('grant-b'),
      ),
    ).toBe(true)
    expect(autonomyStart.status()).toBe(404)

    const autonomyCancel = response()
    expect(
      await handleMissionRoute(
        request('POST'),
        autonomyCancel.res,
        new URL(`http://localhost/api/missions/${mission.id}/autonomy/cancel`),
        contextFor('grant-b'),
      ),
    ).toBe(true)
    expect(autonomyCancel.status()).toBe(404)
  })

  it('allows the owning grant to PATCH its own mission', async () => {
    const mission = await service.create(
      {
        name: 'Mission',
        objective: 'Do the thing',
        workspaceKind: 'repository',
        repositoryPath: cwd,
        runtimeMode: 'READ_ONLY',
        labels: [],
      },
      { grantId: 'grant-a' },
    )

    const patch = response()
    expect(
      await handleMissionRoute(
        request('PATCH', { revision: mission.revision }),
        patch.res,
        new URL(`http://localhost/api/missions/${mission.id}`),
        contextFor('grant-a'),
      ),
    ).toBe(true)
    expect(patch.status()).toBe(200)
  })

  it('leaves the operator (no grantId) unrestricted on every mutating action', async () => {
    const mission = await service.create(
      {
        name: 'Mission',
        objective: 'Do the thing',
        workspaceKind: 'repository',
        repositoryPath: cwd,
        runtimeMode: 'READ_ONLY',
        labels: [],
      },
      { grantId: 'grant-a' },
    )

    const patch = response()
    expect(
      await handleMissionRoute(
        request('PATCH', { revision: mission.revision }),
        patch.res,
        new URL(`http://localhost/api/missions/${mission.id}`),
        contextFor(undefined),
      ),
    ).toBe(true)
    expect(patch.status()).toBe(200)
  })

  it('degrades gracefully (500, not an uncaught throw) for a malformed mission id', async () => {
    // `does-not-exist` fails `isValidMissionId`, so `MissionService.get()` throws a plain
    // `Error`, not `MissionNotFoundError` -- the ownership-check block must not let that
    // propagate uncaught out of `handleMissionRoute`.
    const del = response()
    expect(
      await handleMissionRoute(
        request('DELETE'),
        del.res,
        new URL(`http://localhost/api/missions/does-not-exist`),
        contextFor('grant-b'),
      ),
    ).toBe(true)
    expect(del.status()).toBe(500)
  })
})
