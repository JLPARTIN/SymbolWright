import { describe, expect, it } from 'vitest'

import {
  createMissionExportBundle,
  parseMissionExportBundle,
  serializeMissionExportBundle,
} from './mission-export.js'
import type { CodeMindMission } from './mission-types.js'

const mission: CodeMindMission = {
  schemaVersion: 1,
  revision: 1,
  id: 'mission_11111111-1111-4111-8111-111111111111',
  name: 'Export',
  objective: 'Portable resume',
  status: 'ACTIVE',
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  lastOpenedAt: '2026-07-20T00:00:00.000Z',
  repository: { rootPath: '.', modifiedPaths: [] },
  agent: { runtimeMode: 'READ_ONLY', messages: [] },
  workspace: { kind: 'repository', openFiles: [], scratchAttached: false },
  evidence: { toolCalls: [], validationRuns: [], webAccesses: [], mcpCalls: [], subagentRuns: [], skillRuns: [] },
  references: { checkpointIds: [], checkpointLinks: [], memoryEntryIds: [], memoryLinks: [], commitShas: [], pullRequestUrls: [] },
  labels: [],
}

describe('mission export', () => {
  it('round-trips a schema version 1 bundle', () => {
    const bundle = createMissionExportBundle(mission, [], {
      exportedAt: '2026-07-20T01:00:00.000Z',
    })
    const parsed = parseMissionExportBundle(serializeMissionExportBundle(bundle))
    expect(parsed.kind).toBe('codemind.mission.bundle')
    expect(parsed.mission.id).toBe(mission.id)
  })

  it('redacts secrets from the bundle', () => {
    const bundle = createMissionExportBundle(
      { ...mission, notes: 'Bearer export-secret-token' },
      [],
    )
    expect(JSON.stringify(bundle)).not.toContain('export-secret-token')
  })

  it('rejects invalid bundle kinds and oversized imports', () => {
    expect(() => parseMissionExportBundle({ kind: 'wrong', schemaVersion: 1 })).toThrow()
    expect(() => parseMissionExportBundle('x'.repeat(4 * 1024 * 1024 + 1))).toThrow('exceeds')
  })
})
