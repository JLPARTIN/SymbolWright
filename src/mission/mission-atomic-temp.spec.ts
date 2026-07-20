import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionStore } from './mission-store.js'
import type { CodeMindMission } from './mission-types.js'

const ID = 'mission_11111111-1111-4111-8111-111111111111'
function value(): CodeMindMission {
  return {
    schemaVersion: 1, revision: 1, id: ID, name: 'Atomic', objective: 'Recover temp', status: 'ACTIVE',
    createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z', lastOpenedAt: '2026-07-20T00:00:00.000Z',
    repository: { rootPath: '.', modifiedPaths: [] }, agent: { runtimeMode: 'READ_ONLY', messages: [] },
    workspace: { kind: 'repository', openFiles: [], scratchAttached: false },
    evidence: { toolCalls: [], validationRuns: [], webAccesses: [], mcpCalls: [], subagentRuns: [], skillRuns: [] },
    references: { checkpointIds: [], checkpointLinks: [], memoryEntryIds: [], memoryLinks: [], commitShas: [], pullRequestUrls: [] }, labels: [],
  }
}

describe('mission interrupted atomic write recovery', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('promotes the newest complete temporary mission when the target is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-atomic-'))
    roots.push(root)
    const store = new MissionStore({ workspaceRoot: root })
    store.createMission(value())
    const missionPath = join(root, '.codemind', 'missions', ID, 'mission.json')
    const content = readFileSync(missionPath, 'utf8')
    renameSync(missionPath, `${missionPath}.tmp-999-valid`)
    writeFileSync(`${missionPath}.tmp-1000-broken`, '{broken', 'utf8')
    const result = store.readMissionResult(ID)
    expect(result.mission?.id).toBe(ID)
    expect(result.warnings.some((warning) => warning.code === 'STALE_TEMP_RECOVERED')).toBe(true)
    expect(content).toContain(ID)
  })
})
