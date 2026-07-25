import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MissionStore } from './mission-store.js'
import type { SymbolWrightMission } from './mission-types.js'

const ID = 'mission_11111111-1111-4111-8111-111111111111'

function mission(revision = 1): SymbolWrightMission {
  return {
    schemaVersion: 1,
    revision,
    id: ID,
    name: 'Persistent mission',
    objective: 'Survive restart',
    status: 'ACTIVE',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: `2026-07-20T00:00:0${revision}.000Z`,
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
}

describe('MissionStore', () => {
  let root: string
  let store: MissionStore

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'symbolwright-mission-store-'))
    store = new MissionStore({
      workspaceRoot: root,
      env: { SYMBOLWRIGHT_API_KEY: 'never-persist-me' },
    })
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('creates, reads, updates, lists, and deletes a mission', () => {
    store.createMission(mission())
    expect(store.readMission(ID)?.name).toBe('Persistent mission')
    expect(store.listMissions().missions).toHaveLength(1)
    store.writeMission({ ...mission(2), name: 'Renamed' })
    expect(store.readMission(ID)?.revision).toBe(2)
    store.deleteMission(ID)
    expect(store.readMission(ID)).toBeUndefined()
  })

  it('writes split records and an append-only event file', () => {
    store.createMission(mission())
    const dir = join(root, '.symbolwright', 'missions', ID)
    expect(existsSync(join(dir, 'mission.json'))).toBe(true)
    expect(existsSync(join(dir, 'conversation.json'))).toBe(true)
    expect(existsSync(join(dir, 'workspace.json'))).toBe(true)
    expect(existsSync(join(dir, 'events.jsonl'))).toBe(true)
    expect(existsSync(join(dir, 'artifacts'))).toBe(true)
  })

  it('rejects traversal and invalid mission ids', () => {
    expect(() => store.readMission('../../etc')).toThrow('Invalid mission id')
  })

  it('skips corrupt records without crashing listing', () => {
    store.createMission(mission())
    writeFileSync(join(root, '.symbolwright', 'missions', ID, 'mission.json'), '{broken', 'utf8')
    const result = store.listMissions()
    expect(result.warnings.some((warning) => warning.code === 'CORRUPT_RECORD')).toBe(true)
  })

  it('recovers an index from mission directories', () => {
    store.createMission(mission())
    writeFileSync(join(root, '.symbolwright', 'missions', 'index.json'), '{broken', 'utf8')
    const result = store.listMissions()
    expect(result.missions).toHaveLength(1)
    expect(result.warnings.some((warning) => warning.code === 'INDEX_RECOVERED')).toBe(true)
  })

  it('retains a previous valid mission record for atomic-write recovery', () => {
    store.createMission(mission())
    store.writeMission({ ...mission(2), name: 'Second' })
    const dir = join(root, '.symbolwright', 'missions', ID)
    expect(JSON.parse(readFileSync(join(dir, 'mission.json.previous'), 'utf8')).revision).toBe(1)
  })

  it('redacts environment secrets from every persisted mission file', () => {
    store.createMission({
      ...mission(),
      notes: 'Authorization: Bearer never-persist-me',
      agent: { ...mission().agent, activeProviderId: 'anthropic' },
    })
    const dir = join(root, '.symbolwright', 'missions', ID)
    for (const file of ['mission.json', 'conversation.json', 'workspace.json']) {
      expect(readFileSync(join(dir, file), 'utf8')).not.toContain('never-persist-me')
    }
  })
})
