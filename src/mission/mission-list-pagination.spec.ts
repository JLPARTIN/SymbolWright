import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionStore } from './mission-store.js'
import type { CodeMindMission } from './mission-types.js'

function mission(id: string, updatedAt: string): CodeMindMission {
  return {
    schemaVersion: 1,
    revision: 1,
    id,
    name: id,
    objective: 'List',
    status: 'ACTIVE',
    createdAt: updatedAt,
    updatedAt,
    lastOpenedAt: updatedAt,
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
}

describe('mission list pagination', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('orders by recent activity and applies offset/limit', () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-list-'))
    roots.push(root)
    const store = new MissionStore({ workspaceRoot: root })
    store.createMission(
      mission('mission_11111111-1111-4111-8111-111111111111', '2026-07-20T00:00:00.000Z'),
    )
    store.createMission(
      mission('mission_22222222-2222-4222-8222-222222222222', '2026-07-21T00:00:00.000Z'),
    )
    const result = store.listMissions({ offset: 1, limit: 1 })
    expect(result.total).toBe(2)
    expect(result.missions[0]?.id).toBe('mission_11111111-1111-4111-8111-111111111111')
  })
})
