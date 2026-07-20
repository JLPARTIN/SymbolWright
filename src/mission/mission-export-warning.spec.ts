import { describe, expect, it } from 'vitest'

import { createMissionExportBundle } from './mission-export.js'
import type { CodeMindMission } from './mission-types.js'

const mission = {
  schemaVersion: 1, revision: 1,
  id: 'mission_11111111-1111-4111-8111-111111111111', name: 'Warnings', objective: 'Honest export', status: 'ACTIVE',
  createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z', lastOpenedAt: '2026-07-20T00:00:00.000Z',
  repository: { rootPath: '.', modifiedPaths: [] }, agent: { runtimeMode: 'READ_ONLY', messages: [] },
  workspace: { kind: 'repository', openFiles: [], scratchAttached: false },
  evidence: { toolCalls: [], validationRuns: [], webAccesses: [], mcpCalls: [], subagentRuns: [], skillRuns: [] },
  references: { checkpointIds: [], checkpointLinks: [], memoryEntryIds: [], memoryLinks: [], commitShas: [], pullRequestUrls: [] }, labels: [],
} satisfies CodeMindMission

describe('mission export warnings', () => {
  it('states that repository, checkpoint, and credential content is excluded', () => {
    const warnings = createMissionExportBundle(mission, []).warnings.join(' ')
    expect(warnings).toContain('Repository file contents')
    expect(warnings).toContain('checkpoint snapshots')
    expect(warnings).toContain('credentials')
  })
})
