import type { IncomingMessage, ServerResponse } from 'node:http'

import { describe, expect, it, vi } from 'vitest'

import { registerAutonomousMissionReleaseService } from '../../autonomy/autonomous-mission-release-registry.js'
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
  const coordinator = {
    start: vi.fn(),
    resume: vi.fn(),
    status: vi.fn(async () => ({ missionId: 'mission-1', status: 'completed' })),
    specialists: vi.fn(async () => undefined),
  }
  return {
    coordinator,
    control: {
      pause: vi.fn(),
      cancel: vi.fn(),
      retry: vi.fn(),
    },
  }
}

describe('autonomous mission release routes', () => {
  it('executes the complete release operation and returns the persisted release on status', async () => {
    const context = routeContext()
    const releaseRecord = {
      missionId: 'mission-1',
      state: 'merge-ready',
      nextAction: 'merge',
    }
    const release = {
      execute: vi.fn(async () => releaseRecord),
      load: vi.fn(async () => releaseRecord),
    }
    registerAutonomousMissionReleaseService(context.coordinator as never, release as never)

    const executed = response()
    await handleAutonomousMissionRoute(
      request('POST'),
      executed.res,
      new URL('http://localhost/api/missions/mission-1/autonomy/release'),
      context as never,
    )

    expect(release.execute).toHaveBeenCalledWith('mission-1')
    expect(executed.res.writeHead).toHaveBeenCalledWith(200, expect.any(Object))
    expect(JSON.parse(executed.chunks[0] ?? '{}')).toEqual({ release: releaseRecord })

    const status = response()
    await handleAutonomousMissionRoute(
      request('GET'),
      status.res,
      new URL('http://localhost/api/missions/mission-1/autonomy'),
      context as never,
    )

    expect(release.load).toHaveBeenCalledWith('mission-1')
    expect(JSON.parse(status.chunks[0] ?? '{}')).toEqual({
      dashboard: { missionId: 'mission-1', status: 'completed' },
      release: releaseRecord,
    })
  })

  it('reports an unconfigured release runtime as a state conflict', async () => {
    const context = routeContext()
    const result = response()

    await handleAutonomousMissionRoute(
      request('POST'),
      result.res,
      new URL('http://localhost/api/missions/mission-1/autonomy/release'),
      context as never,
    )

    expect(result.res.writeHead).toHaveBeenCalledWith(409, expect.any(Object))
    expect(JSON.parse(result.chunks[0] ?? '{}').error).toContain('not configured')
  })
})
