import { appendFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createMissionEvent } from './mission-events.js'
import { MissionStore } from './mission-store.js'
import type { SymbolWrightMission } from './mission-types.js'

const ID = 'mission_11111111-1111-4111-8111-111111111111'
const mission: SymbolWrightMission = {
  schemaVersion: 1,
  revision: 1,
  id: ID,
  name: 'Events',
  objective: 'Recover',
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

describe('mission torn event recovery', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('skips a malformed final line and preserves prior events', () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-torn-event-'))
    roots.push(root)
    const store = new MissionStore({ workspaceRoot: root })
    store.createMission(mission)
    store.appendEvent(
      createMissionEvent({ missionId: ID, type: 'mission.created', summary: 'Created' }),
    )
    appendFileSync(join(root, '.symbolwright', 'missions', ID, 'events.jsonl'), '{torn', 'utf8')
    expect(store.readEvents(ID)).toHaveLength(1)
  })
})
