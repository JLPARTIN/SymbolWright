import { describe, expect, it } from 'vitest'

import { createMissionExportBundle } from './mission-export.js'
import type { CodeMindMission } from './mission-types.js'

const mission: CodeMindMission = {
  schemaVersion: 1, revision: 1,
  id: 'mission_11111111-1111-4111-8111-111111111111',
  name: 'Boundary', objective: 'References only', status: 'ACTIVE',
  createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z', lastOpenedAt: '2026-07-20T00:00:00.000Z',
  repository: { rootPath: '.', modifiedPaths: ['a.txt'] },
  agent: { runtimeMode: 'READ_ONLY', messages: [] },
  workspace: { kind: 'repository', openFiles: [{ path: 'a.txt', openedAt: '2026-07-20T00:00:00.000Z', contentHash: 'hash' }], scratchAttached: false },
  evidence: { toolCalls: [], validationRuns: [], webAccesses: [], mcpCalls: [], subagentRuns: [], skillRuns: [] },
  references: {
    checkpointIds: ['checkpoint-1'],
    checkpointLinks: [{ checkpointId: 'checkpoint-1', createdAt: '2026-07-20T00:00:00.000Z', paths: ['a.txt'] }],
    memoryEntryIds: [], memoryLinks: [], commitShas: [], pullRequestUrls: [],
  },
  labels: [],
}

describe('mission export content boundary', () => {
  it('exports paths, hashes, and references but no repository or checkpoint file content', () => {
    const serialized = JSON.stringify(createMissionExportBundle(mission, []))
    expect(serialized).toContain('a.txt')
    expect(serialized).toContain('checkpoint-1')
    expect(serialized).not.toContain('originalContent')
    expect(serialized).not.toContain('snapshotContent')
  })
})
