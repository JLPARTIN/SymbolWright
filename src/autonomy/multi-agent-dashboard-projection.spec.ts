import { describe, expect, it } from 'vitest'

import type { MultiAgentMissionState } from './multi-agent-mission-runtime.js'
import { projectMultiAgentDashboard } from './multi-agent-dashboard-projection.js'

const state: MultiAgentMissionState = {
  schemaVersion: 1,
  missionId: 'mission-1',
  objective: 'Ship feature',
  createdAt: '2026-07-22T22:00:00.000Z',
  updatedAt: '2026-07-22T22:05:00.000Z',
  assignments: [
    {
      agentId: 'repository-analyst-analysis',
      role: 'repository-analyst',
      taskId: 'analysis',
      status: 'completed',
      evidence: [{ kind: 'tool-call', id: 'analysis-evidence' }],
      diagnostics: [],
      modifiedFiles: [],
    },
    {
      agentId: 'code-editor-edit',
      role: 'code-editor',
      taskId: 'edit',
      status: 'running',
      evidence: [{ kind: 'edit-session', id: 'edit-evidence' }],
      diagnostics: [],
      modifiedFiles: ['src/a.ts'],
    },
    {
      agentId: 'repair-agent-repair',
      role: 'repair-agent',
      taskId: 'repair',
      status: 'waiting',
      evidence: [],
      diagnostics: ['waiting for validation'],
      modifiedFiles: ['src/a.ts', 'src/b.ts'],
    },
  ],
}

describe('multi-agent dashboard projection', () => {
  it('summarizes active agents, evidence, states, and modified files', () => {
    const dashboard = projectMultiAgentDashboard(state)

    expect(dashboard.statusCounts).toEqual({
      idle: 0,
      running: 1,
      waiting: 1,
      failed: 0,
      completed: 1,
    })
    expect(dashboard.activeAgents.map((agent) => agent.taskId)).toEqual(['edit', 'repair'])
    expect(dashboard.evidenceCount).toBe(2)
    expect(dashboard.modifiedFiles).toEqual(['src/a.ts', 'src/b.ts'])
    expect(dashboard.agents[2]?.diagnostics).toEqual(['waiting for validation'])
  })
})
