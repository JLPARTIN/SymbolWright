import type { IncomingMessage, ServerResponse } from 'node:http'

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { MissionService } from '../../mission/mission-service.js'
import { handleMissionRoute } from './mission-routes.js'

function request(method: string): IncomingMessage {
  return { method } as IncomingMessage
}

function response() {
  const chunks: string[] = []
  const res = {
    writeHead: vi.fn(),
    end: vi.fn((chunk?: string) => {
      if (chunk !== undefined) chunks.push(chunk)
    }),
  } as unknown as ServerResponse
  return { res, chunks }
}

async function context() {
  const cwd = await mkdtemp(path.join(tmpdir(), 'symbolwright-live-autonomy-route-'))
  return {
    cwd,
    service: new MissionService({ workspaceRoot: cwd, env: {} }),
  }
}

describe('live autonomous mission route registration', () => {
  it('delegates autonomy actions before revision-based mission actions', async () => {
    const output = response()

    expect(
      await handleMissionRoute(
        request('GET'),
        output.res,
        new URL('http://localhost/api/missions/mission-1/autonomy/start'),
        await context(),
      ),
    ).toBe(true)

    expect(output.res.writeHead).toHaveBeenCalledWith(405, expect.any(Object))
    expect(JSON.parse(output.chunks[0] ?? '{}')).toEqual({ error: 'method_not_allowed' })
  })

  it('keeps the ordinary mission collection route available', async () => {
    const output = response()

    await handleMissionRoute(
      request('GET'),
      output.res,
      new URL('http://localhost/api/missions'),
      await context(),
    )

    expect(output.res.writeHead).toHaveBeenCalledWith(200, expect.any(Object))
    const body = JSON.parse(output.chunks[0] ?? '{}') as unknown
    expect(body).toMatchObject({
      missions: [],
      offset: 0,
      limit: 50,
      total: 0,
    })
  })
})
