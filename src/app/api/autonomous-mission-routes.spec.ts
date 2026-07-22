import type { IncomingMessage, ServerResponse } from 'node:http'

import { describe, expect, it, vi } from 'vitest'

import { handleAutonomousMissionRoute } from './autonomous-mission-routes.js'

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

function request(method: string): IncomingMessage {
  return { method } as IncomingMessage
}

describe('autonomous mission routes', () => {
  it('starts, resumes, and returns dashboard status', async () => {
    const coordinator = {
      start: vi.fn(async () => ({ execution: { completedAt: 'now' } })),
      resume: vi.fn(async () => ({ execution: { completedAt: 'later' } })),
      status: vi.fn(async () => ({ missionId: 'mission-1', status: 'completed' })),
    }

    const started = response()
    expect(
      await handleAutonomousMissionRoute(
        request('POST'),
        started.res,
        new URL('http://localhost/api/missions/mission-1/autonomy/start'),
        { coordinator: coordinator as never },
      ),
    ).toBe(true)
    expect(coordinator.start).toHaveBeenCalledWith('mission-1')
    expect(started.res.writeHead).toHaveBeenCalledWith(202, expect.any(Object))

    const resumed = response()
    await handleAutonomousMissionRoute(
      request('POST'),
      resumed.res,
      new URL('http://localhost/api/missions/mission-1/autonomy/resume'),
      { coordinator: coordinator as never },
    )
    expect(coordinator.resume).toHaveBeenCalledWith('mission-1')

    const status = response()
    await handleAutonomousMissionRoute(
      request('GET'),
      status.res,
      new URL('http://localhost/api/missions/mission-1/autonomy'),
      { coordinator: coordinator as never },
    )
    expect(coordinator.status).toHaveBeenCalledWith('mission-1')
    expect(JSON.parse(status.chunks[0] ?? '{}')).toEqual({
      dashboard: { missionId: 'mission-1', status: 'completed' },
    })
  })

  it('declines unrelated routes and reports unsupported methods', async () => {
    const coordinator = { start: vi.fn(), resume: vi.fn(), status: vi.fn() }
    const unrelated = response()
    expect(
      await handleAutonomousMissionRoute(
        request('GET'),
        unrelated.res,
        new URL('http://localhost/api/health'),
        { coordinator: coordinator as never },
      ),
    ).toBe(false)

    const unsupported = response()
    await handleAutonomousMissionRoute(
      request('DELETE'),
      unsupported.res,
      new URL('http://localhost/api/missions/mission-1/autonomy'),
      { coordinator: coordinator as never },
    )
    expect(unsupported.res.writeHead).toHaveBeenCalledWith(405, expect.any(Object))
  })
})
