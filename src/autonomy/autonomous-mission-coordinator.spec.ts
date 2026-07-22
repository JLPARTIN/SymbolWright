import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from '../mission/mission-service.js'
import { MissionStore } from '../mission/mission-store.js'
import type { CodeMindMission } from '../mission/mission-types.js'
import { AutonomousMissionCoordinator } from './autonomous-mission-coordinator.js'
import {
  JsonMissionExecutionStore,
  PersistentMissionExecutor,
  type MissionTaskExecutor,
} from './persistent-mission-executor.js'
import type { RepositorySemanticIndexSnapshot } from './repository-semantic-index.types.js'

const roots: string[] = []

function mission(root: string): CodeMindMission {
  return {
    schemaVersion: 1,
    revision: 1,
    id: 'mission_11111111-1111-4111-8111-111111111111',
    name: 'Autonomous feature mission',
    objective: 'Add OAuth session support',
    status: 'ACTIVE',
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
    lastOpenedAt: '2026-07-22T00:00:00.000Z',
    repository: { rootPath: root, modifiedPaths: [] },
    agent: { runtimeMode: 'APPROVED_EXECUTION', messages: [] },
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

function semanticIndex(root: string): RepositorySemanticIndexSnapshot {
  const now = '2026-07-22T00:00:00.000Z'
  return {
    schemaVersion: 1,
    repositoryRoot: root,
    createdAt: now,
    updatedAt: now,
    files: [
      {
        path: 'src/oauth-session.ts',
        language: 'typescript',
        contentHash: 'hash-a',
        generated: false,
        packageOwner: 'codemind',
        indexedAt: now,
      },
      {
        path: 'src/server.ts',
        language: 'typescript',
        contentHash: 'hash-b',
        generated: false,
        packageOwner: 'codemind',
        indexedAt: now,
      },
    ],
    symbols: [
      {
        id: 'symbol-oauth-session',
        name: 'OAuthSession',
        kind: 'class',
        filePath: 'src/oauth-session.ts',
        line: 1,
        exported: true,
      },
    ],
    imports: [
      {
        filePath: 'src/server.ts',
        source: './oauth-session.js',
        names: ['OAuthSession'],
      },
    ],
    references: [{ symbolName: 'OAuthSession', filePath: 'src/server.ts', line: 8 }],
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('AutonomousMissionCoordinator', () => {
  it('plans, executes, persists dashboard state, and records mission evidence', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'codemind-autonomy-coordinator-'))
    roots.push(root)
    const missionStore = new MissionStore({ workspaceRoot: root })
    const storedMission = mission(root)
    missionStore.createMission(storedMission)
    const missionService = new MissionService({ workspaceRoot: root, store: missionStore })
    const executionStore = new JsonMissionExecutionStore(root)
    const taskExecutor: MissionTaskExecutor = {
      async execute(task) {
        return {
          state: 'completed',
          evidence: [{ kind: task.kind === 'validation' ? 'validation' : 'tool-call', id: `evidence-${task.id}` }],
          ...(task.kind === 'edit-session' ? { modifiedFiles: ['src/oauth-session.ts', 'src/server.ts'] } : {}),
        }
      },
    }
    const executor = new PersistentMissionExecutor({ store: executionStore, executor: taskExecutor })
    const coordinator = new AutonomousMissionCoordinator({
      missionService,
      executor,
      executionStore,
      loadSemanticIndex: async () => semanticIndex(root),
      validationCommands: ['npm run typecheck', 'npm test'],
      now: () => new Date('2026-07-22T00:10:00.000Z'),
    })

    const result = await coordinator.start(storedMission.id)

    expect(result.plan.affectedFiles).toEqual(['src/oauth-session.ts', 'src/server.ts'])
    expect(result.execution.completedAt).toBeDefined()
    expect(result.execution.modifiedFiles).toEqual(['src/oauth-session.ts', 'src/server.ts'])
    expect(result.dashboard.status).toBe('completed')
    expect(result.dashboard.taskCounts.completed).toBe(6)
    expect(await coordinator.status(storedMission.id)).toEqual(result.dashboard)

    const eventTypes = missionService.readEvents(storedMission.id).map((event) => event.type)
    expect(eventTypes).toContain('autonomy.plan.created')
    expect(eventTypes).toContain('autonomy.execution.completed')
    expect(eventTypes.filter((type) => type === 'autonomy.task.evidence')).toHaveLength(6)
  })
})
