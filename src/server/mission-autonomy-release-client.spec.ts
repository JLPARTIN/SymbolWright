import { describe, expect, it, vi } from 'vitest'

import { createMissionAutonomyClient } from './mission-autonomy-client.js'
import type { MissionAutonomyRequest } from './mission-autonomy-client.js'

describe('mission autonomy release client', () => {
  it('requests a complete autonomous release through the authenticated mission path', async () => {
    const request = vi.fn(
      async <T>() => ({ release: { state: 'merge-ready' } }) as T,
    ) as MissionAutonomyRequest & ReturnType<typeof vi.fn>
    const client = createMissionAutonomyClient(request)

    const result = await client.release('mission-1')

    expect(result).toEqual({ release: { state: 'merge-ready' } })
    expect(request).toHaveBeenCalledWith('/api/missions/mission-1/autonomy/release', {
      method: 'POST',
    })
  })

  it('surfaces a persisted release during dashboard polling', async () => {
    const controller = new AbortController()
    const onDashboard = vi.fn()
    const onRelease = vi.fn(() => controller.abort())
    const request = vi.fn(
      async <T>() =>
        ({
          dashboard: { status: 'completed' },
          release: { state: 'merge-ready', nextAction: 'merge' },
        }) as T,
    ) as MissionAutonomyRequest & ReturnType<typeof vi.fn>
    const client = createMissionAutonomyClient(request)

    await client.poll('mission-2', onDashboard, {
      intervalMs: 100,
      signal: controller.signal,
      onRelease: onRelease as never,
    })

    expect(onDashboard).toHaveBeenCalledWith({ status: 'completed' })
    expect(onRelease).toHaveBeenCalledWith({ state: 'merge-ready', nextAction: 'merge' })
  })
})
