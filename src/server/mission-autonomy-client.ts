import type { AutonomousMissionReleaseRecord } from '../autonomy/autonomous-mission-release.js'

export type AutonomousMissionAction = 'start' | 'pause' | 'resume' | 'cancel' | 'retry'

export interface MissionAutonomyRequest {
  <T>(path: string, init?: RequestInit): Promise<T>
}

export interface MissionAutonomyStatusResponse {
  readonly dashboard: unknown
  readonly specialists?: unknown
  readonly release?: AutonomousMissionReleaseRecord
}

export interface MissionAutonomyReleaseResponse {
  readonly release: AutonomousMissionReleaseRecord
}

export interface MissionAutonomyClient {
  status(missionId: string): Promise<MissionAutonomyStatusResponse>
  action(missionId: string, action: AutonomousMissionAction): Promise<unknown>
  release(missionId: string): Promise<MissionAutonomyReleaseResponse>
  poll(
    missionId: string,
    onDashboard: (dashboard: unknown) => void,
    options?: {
      readonly intervalMs?: number
      readonly signal?: AbortSignal
      readonly onSpecialists?: (specialists: unknown) => void
      readonly onRelease?: (release: AutonomousMissionReleaseRecord) => void
    },
  ): Promise<void>
}

export function createMissionAutonomyClient(
  request: MissionAutonomyRequest,
): MissionAutonomyClient {
  return {
    async status(missionId) {
      return request<MissionAutonomyStatusResponse>(autonomyPath(missionId))
    },
    async action(missionId, action) {
      return request(`${autonomyPath(missionId)}/${action}`, { method: 'POST' })
    },
    async release(missionId) {
      return request<MissionAutonomyReleaseResponse>(`${autonomyPath(missionId)}/release`, {
        method: 'POST',
      })
    },
    async poll(missionId, onDashboard, options = {}) {
      const intervalMs = options.intervalMs ?? 1_000
      if (!Number.isFinite(intervalMs) || intervalMs < 100) {
        throw new Error('Autonomy polling interval must be at least 100ms.')
      }
      while (!options.signal?.aborted) {
        const result = await request<MissionAutonomyStatusResponse>(autonomyPath(missionId))
        onDashboard(result.dashboard)
        if (result.specialists !== undefined) options.onSpecialists?.(result.specialists)
        if (result.release !== undefined) options.onRelease?.(result.release)
        await delay(intervalMs, options.signal)
      }
    },
  }
}

function autonomyPath(missionId: string): string {
  const normalized = missionId.trim()
  if (!/^[A-Za-z0-9._-]+$/.test(normalized)) {
    throw new Error(`Invalid mission ID: ${missionId}`)
  }
  return `/api/missions/${encodeURIComponent(normalized)}/autonomy`
}

async function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}
