import { describe, expect, it } from 'vitest'

import type { MissionDashboardProjection } from '../autonomy/mission-dashboard-projection.js'
import { availableActions, renderMissionDashboardHtml } from './mission-dashboard-html.js'

function dashboard(
  overrides: Partial<MissionDashboardProjection> = {},
): MissionDashboardProjection {
  return {
    missionId: 'mission-1',
    objective: 'Implement <secure> dashboard',
    status: 'running',
    taskCounts: {
      queued: 1,
      blocked: 0,
      ready: 0,
      running: 1,
      validating: 0,
      repairing: 0,
      completed: 2,
      failed: 0,
      cancelled: 0,
      interrupted: 0,
    },
    tasks: [
      {
        id: 'task-1',
        objective: 'Edit <script>alert(1)</script>',
        state: 'running',
        attempts: 1,
        dependencies: [],
      },
    ],
    currentValidationPhase: 'validation-2',
    repairAttemptCount: 1,
    modifiedFiles: ['src/server/chat-ui-html.ts'],
    timeline: [{ timestamp: '2026-07-22T20:00:00.000Z', label: 'Mission started' }],
    startedAt: '2026-07-22T20:00:00.000Z',
    updatedAt: '2026-07-22T20:01:00.000Z',
    durationMs: 61_000,
    estimatedCompletionMs: 30_000,
    ...overrides,
  }
}

describe('renderMissionDashboardHtml', () => {
  it('renders live metrics, controls, tasks, files, and timeline safely', () => {
    const html = renderMissionDashboardHtml(dashboard())

    expect(html).toContain('data-autonomy-action="pause"')
    expect(html).toContain('data-autonomy-action="cancel"')
    expect(html).toContain('Validation: validation-2')
    expect(html).toContain('src/server/chat-ui-html.ts')
    expect(html).toContain('1m 1s')
    expect(html).toContain('30s')
    expect(html).toContain('&lt;secure&gt;')
    expect(html).not.toContain('<script>')
  })

  it('renders an empty modified-files state and no controls after completion', () => {
    const html = renderMissionDashboardHtml(
      dashboard({ status: 'completed', modifiedFiles: [], estimatedCompletionMs: undefined }),
    )

    expect(html).toContain('No files modified yet.')
    expect(html).not.toContain('data-autonomy-action=')
    expect(html).toContain('<dd>—</dd>')
  })
})

describe('availableActions', () => {
  it('maps mission states to valid operator controls', () => {
    expect(availableActions('running')).toEqual(['pause', 'cancel'])
    expect(availableActions('interrupted')).toEqual(['resume', 'cancel'])
    expect(availableActions('blocked')).toEqual(['retry', 'cancel'])
    expect(availableActions('failed')).toEqual(['retry', 'cancel'])
    expect(availableActions('completed')).toEqual([])
  })
})
