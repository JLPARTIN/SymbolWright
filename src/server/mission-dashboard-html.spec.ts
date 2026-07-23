import { describe, expect, it } from 'vitest'

import type { MissionDashboardProjection } from '../autonomy/mission-dashboard-projection.js'
import type { MultiAgentDashboardProjection } from '../autonomy/multi-agent-dashboard-projection.js'
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

function specialists(): MultiAgentDashboardProjection {
  return {
    missionId: 'mission-1',
    objective: 'Implement secure dashboard',
    statusCounts: { idle: 0, running: 1, waiting: 0, failed: 0, completed: 1 },
    activeAgents: [
      {
        agentId: 'code-editor-edit',
        role: 'code-editor',
        taskId: 'edit',
        status: 'running',
        evidenceCount: 2,
        diagnostics: [],
        modifiedFiles: ['src/server/chat-ui-html.ts'],
      },
    ],
    agents: [
      {
        agentId: 'repository-analyst-analysis',
        role: 'repository-analyst',
        taskId: 'analysis',
        status: 'completed',
        evidenceCount: 1,
        diagnostics: [],
        modifiedFiles: [],
      },
      {
        agentId: 'code-editor-edit',
        role: 'code-editor',
        taskId: 'edit',
        status: 'running',
        evidenceCount: 2,
        diagnostics: ['Inspect <unsafe> output'],
        modifiedFiles: ['src/server/chat-ui-html.ts'],
      },
    ],
    evidenceCount: 3,
    modifiedFiles: ['src/server/chat-ui-html.ts'],
    updatedAt: '2026-07-22T20:01:00.000Z',
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

  it('renders persisted specialist agents and diagnostics safely', () => {
    const html = renderMissionDashboardHtml(dashboard(), specialists())

    expect(html).toContain('Specialist agents')
    expect(html).toContain('data-agent-role="code-editor"')
    expect(html).toContain('edit · running · 2 evidence')
    expect(html).toContain('Inspect &lt;unsafe&gt; output')
    expect(html).not.toContain('<unsafe>')
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
