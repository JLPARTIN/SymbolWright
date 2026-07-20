import { describe, expect, it } from 'vitest'

import {
  assertCodeMindMission,
  parseCreateMissionInput,
  parsePatchMissionInput,
} from './mission-validation.js'

describe('mission validation', () => {
  it('parses creation and patch inputs', () => {
    expect(parseCreateMissionInput({
      name: 'Mission', objective: 'Objective', workspaceKind: 'repository',
      repositoryPath: '.', runtimeMode: 'READ_ONLY', labels: ['one', 'one'],
    }).labels).toEqual(['one'])
    expect(parsePatchMissionInput({ revision: 1, name: 'Renamed' }).revision).toBe(1)
  })

  it('rejects malformed runtime modes, paths, and revisions', () => {
    expect(() => parseCreateMissionInput({
      name: 'Mission', objective: 'Objective', workspaceKind: 'wrong', repositoryPath: '.', runtimeMode: 'READ_ONLY',
    })).toThrow('workspaceKind')
    expect(() => parsePatchMissionInput({ revision: 0 })).toThrow('revision')
  })

  it('validates the versioned mission model', () => {
    const value = {
      schemaVersion: 1, revision: 1,
      id: 'mission_11111111-1111-4111-8111-111111111111',
      name: 'Mission', objective: 'Objective', status: 'ACTIVE',
      createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z', lastOpenedAt: '2026-07-20T00:00:00.000Z',
      repository: { rootPath: '.', modifiedPaths: [] },
      agent: { runtimeMode: 'READ_ONLY', messages: [] },
      workspace: { kind: 'repository', openFiles: [], scratchAttached: false },
      evidence: { toolCalls: [], validationRuns: [], webAccesses: [], mcpCalls: [], subagentRuns: [], skillRuns: [] },
      references: { checkpointIds: [], checkpointLinks: [], memoryEntryIds: [], memoryLinks: [], commitShas: [], pullRequestUrls: [] },
      labels: [],
    }
    expect(() => assertCodeMindMission(value)).not.toThrow()
  })
})
