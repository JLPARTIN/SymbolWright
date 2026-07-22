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

function routeContext() {
  return {
    coordinator: {
      start: vi.fn(async () => ({ execution: { completedAt: 'now' } })),
      resume: vi.fn(async () => ({ execution: { completedAt: 'later' } })),
      status: vi.fn(async () => ({ missionId: 'mission-1', status: 'completed' })),
    },
    control: {
      pause: vi.fn(async () => ({ graph: { tasks: [] } })),
      cancel: vi.fn(async () => ({ graph: { tasks: [] } })),
      retry: vi.fn(async () => ({ graph: { tasks: [] } })),
    },
  }
}

describe('autonomous mission routes', () => {
  it('starts, resumes, and returns dashboard status', async () => {
    const context = routeContext()

    const started = response()
    expect(
      await handleAutonomousMissionRoute(
        request('POST'),
        started.res,
        new URL('http://localhost/api/missions/mission-1/autonomy/start'),
        context as never,
      ),
    ).toBe(true)
    expect(context.coordinator.start).toHaveBeenCalledWith('mission-1')
    expect(started.res.writeHead).toHaveBeenCalledWith(202, expect.any(Object))

    const resumed = response()
    await handleAutonomousMissionRoute(
      request('POST'),
      resumed.res,
      new URL('http://localhost/api/missions/mission-1/autonomy/resume'),
      context as never,
    )
    expect(context.coordinator.resume).toHaveBeenCalledWith('mission-1')

    const status = response()
    await handleAutonomousMissionRoute(
      request('GET'),
      status.res,
      new URL('http://localhost/api/missions/mission-1/autonomy'),
      context as never,
    )
    expect(context.coordinator.status).toHaveBeenCalledWith('mission-1')
    expect(JSON.parse(status.chunks[0] ?? '{}')).toEqual({
      dashboard: { missionId: 'mission-1', status: 'completed' },
    })
  })

  it('pauses cancels and retries autonomous mission executions', async () => {
    const context = routeContext()

    for (const action of ['pause', 'cancel', 'retry'] as const) {
      const result = response()
      await handleAutonomousMissionRoute(
        request('POST'),
        result.res,
        new URL(`http://localhost/api/missions/mission-1/autonomy/${action}`),
        context as never,
      )
      expect(context.control[action]).toHaveBeenCalledWith('mission-1')
      expect(result.res.writeHead).toHaveBeenCalledWith(202, expect.any(Object))
    }
    expect(context.coordinator.status).toHaveBeenCalledWith('mission-1')
  })

  it('declines unrelated routes and reports unsupported methods', async () => {
    const context = routeContext()
    const unrelated = response()
    expect(
      await handleAutonomousMissionRoute(
        request('GET'),
        unrelated.res,
        new URL('http://localhost/api/health'),
        context as never,
      ),
    ).toBe(false)

    const unsupported = response()
    await handleAutonomousMissionRoute(
      request('DELETE'),
      unsupported.res,
      new URL('http://localhost/api/missions/mission-1/autonomy'),
      context as never,
    )
    expect(unsupported.res.writeHead).toHaveBeenCalledWith(405, expect.any(Object))
  })

  it('maps missing executions to 404 and state conflicts to 409', async () => {
    const missingContext = routeContext()
    missingContext.coordinator.status.mockRejectedValueOnce(
      new Error('Autonomous execution was not found: mission-1'),
    )
    const missing = response()
    await handleAutonomousMissionRoute(
      request('GET'),
      missing.res,
      new URL('http://localhost/api/missions/mission-1/autonomy'),
      missingContext as never,
    )
    expect(missing.res.writeHead).toHaveBeenCalledWith(404, expect.any(Object))

    const conflictContext = routeContext()
    conflictContext.control.pause.mockRejectedValueOnce(
      new Error('Autonomous mission mission-1 cannot pause from its current state.'),
    )
    const conflict = response()
    await handleAutonomousMissionRoute(
      request('POST'),
      conflict.res,
      new URL('http://localhost/api/missions/mission-1/autonomy/pause'),
      conflictContext as never,
    )
    expect(conflict.res.writeHead).toHaveBeenCalledWith(409, expect.any(Object))
  })
})
