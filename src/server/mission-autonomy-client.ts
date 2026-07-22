export type AutonomousMissionAction = 'start' | 'pause' | 'resume' | 'cancel' | 'retry'

export interface MissionAutonomyRequest {
  <T>(path: string, init?: RequestInit): Promise<T>
}

export interface MissionAutonomyClient {
  status(missionId: string): Promise<unknown>
  action(missionId: string, action: AutonomousMissionAction): Promise<unknown>
  poll(
    missionId: string,
    onDashboard: (dashboard: unknown) => void,
    options?: { readonly intervalMs?: number; readonly signal?: AbortSignal },
  ): Promise<void>
}

export function createMissionAutonomyClient(
  request: MissionAutonomyRequest,
): MissionAutonomyClient {
  return {
    async status(missionId) {
      return request(autonomyPath(missionId))
    },
    async action(missionId, action) {
      return request(`${autonomyPath(missionId)}/${action}`, { method: 'POST' })
    },
    async poll(missionId, onDashboard, options = {}) {
      const intervalMs = options.intervalMs ?? 1_000
      if (!Number.isFinite(intervalMs) || intervalMs < 100) {
        throw new Error('Autonomy polling interval must be at least 100ms.')
      }
      while (!options.signal?.aborted) {
        const result = await request<{ readonly dashboard: unknown }>(autonomyPath(missionId))
        onDashboard(result.dashboard)
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
