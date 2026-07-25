import { describe, expect, it } from 'vitest'

import { parseMissionExportBundle } from './mission-export.js'

const mission = {
  schemaVersion: 1,
  revision: 1,
  id: 'mission_11111111-1111-4111-8111-111111111111',
  name: 'Import',
  objective: 'Validate',
  status: 'ACTIVE',
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  lastOpenedAt: '2026-07-20T00:00:00.000Z',
  repository: { rootPath: '.', modifiedPaths: [] },
  agent: { runtimeMode: 'READ_ONLY', messages: [] },
  workspace: { kind: 'repository', openFiles: [], scratchAttached: false },
  evidence: {
    toolCalls: [],
    validationRuns: [],
    webAccesses: [],
    mcpCalls: [],
    subagentRuns: [],
    skillRuns: [],
  },
  references: {
    checkpointIds: [],
    checkpointLinks: [],
    memoryEntryIds: [],
    memoryLinks: [],
    commitShas: [],
    pullRequestUrls: [],
  },
  labels: [],
}

describe('mission import structural safety', () => {
  it('rejects events that could not be represented as structured mission evidence', () => {
    expect(() =>
      parseMissionExportBundle({
        kind: 'symbolwright.mission.bundle',
        schemaVersion: 1,
        exportedAt: '2026-07-20T00:00:00.000Z',
        mission,
        events: [
          { eventId: '../escape', missionId: mission.id, type: 1, timestamp: 'now', summary: 'x' },
        ],
        warnings: [],
      }),
    ).toThrow('Mission event 0 is invalid')
  })
})
