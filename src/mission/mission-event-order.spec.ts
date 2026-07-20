import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createMissionEvent } from './mission-events.js'
import { MissionStore } from './mission-store.js'
import type { CodeMindMission } from './mission-types.js'

const ID = 'mission_11111111-1111-4111-8111-111111111111'
const mission: CodeMindMission = {
  schemaVersion: 1,
  revision: 1,
  id: ID,
  name: 'Order',
  objective: 'Append',
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

describe('mission append order', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('keeps event append order when timestamps match', () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-event-order-'))
    roots.push(root)
    const store = new MissionStore({ workspaceRoot: root })
    store.createMission(mission)
    const timestamp = '2026-07-20T00:00:00.000Z'
    store.appendEvent(createMissionEvent({ missionId: ID, type: 'one', summary: 'one', timestamp }))
    store.appendEvent(createMissionEvent({ missionId: ID, type: 'two', summary: 'two', timestamp }))
    expect(store.readEvents(ID).map((event) => event.type)).toEqual(['one', 'two'])
  })
})
