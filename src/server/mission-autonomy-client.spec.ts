import { describe, expect, it, vi } from 'vitest'

import { createMissionAutonomyClient } from './mission-autonomy-client.js'

describe('mission autonomy client', () => {
  it('requests status and every operator action through the supplied request function', async () => {
    const request = vi.fn(async () => ({ ok: true }))
    const client = createMissionAutonomyClient(request)

    await client.status('mission-1')
    for (const action of ['start', 'pause', 'resume', 'cancel', 'retry'] as const) {
      await client.action('mission-1', action)
    }

    expect(request.mock.calls).toEqual([
      ['/api/missions/mission-1/autonomy'],
      ['/api/missions/mission-1/autonomy/start', { method: 'POST' }],
      ['/api/missions/mission-1/autonomy/pause', { method: 'POST' }],
      ['/api/missions/mission-1/autonomy/resume', { method: 'POST' }],
      ['/api/missions/mission-1/autonomy/cancel', { method: 'POST' }],
      ['/api/missions/mission-1/autonomy/retry', { method: 'POST' }],
    ])
  })

  it('polls dashboard state until aborted', async () => {
    const controller = new AbortController()
    const onDashboard = vi.fn(() => controller.abort())
    const request = vi.fn(async () => ({ dashboard: { status: 'running' } }))
    const client = createMissionAutonomyClient(request)

    await client.poll('mission-2', onDashboard, {
      intervalMs: 100,
      signal: controller.signal,
    })

    expect(onDashboard).toHaveBeenCalledWith({ status: 'running' })
    expect(request).toHaveBeenCalledOnce()
  })

  it('rejects invalid mission IDs and unsafe polling intervals', async () => {
    const client = createMissionAutonomyClient(vi.fn())

    await expect(client.status('../mission')).rejects.toThrow('Invalid mission ID')
    await expect(client.poll('mission-1', vi.fn(), { intervalMs: 50 })).rejects.toThrow(
      'at least 100ms',
    )
  })
})
