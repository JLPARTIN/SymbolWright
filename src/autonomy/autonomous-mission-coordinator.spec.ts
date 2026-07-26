import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { AccessRuntime } from '../access/access-runtime.js'
import type { RepositoryScope } from '../access/access-types.js'
import { MissionService } from '../mission/mission-service.js'
import { MissionStore } from '../mission/mission-store.js'
import type { SymbolWrightMission } from '../mission/mission-types.js'
import {
  AutonomousMissionCoordinator,
  resolveMaxMissionDurationMinutes,
} from './autonomous-mission-coordinator.js'
import {
  JsonMissionExecutionStore,
  PersistentMissionExecutor,
  type MissionTaskExecutor,
} from './persistent-mission-executor.js'
import type { RepositorySemanticIndexSnapshot } from './repository-semantic-index.types.js'

const roots: string[] = []

function mission(root: string): SymbolWrightMission {
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
        packageOwner: 'symbolwright',
        indexedAt: now,
      },
      {
        path: 'src/server.ts',
        language: 'typescript',
        contentHash: 'hash-b',
        generated: false,
        packageOwner: 'symbolwright',
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
    const root = await mkdtemp(path.join(os.tmpdir(), 'symbolwright-autonomy-coordinator-'))
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
          evidence: [
            {
              kind: task.kind === 'validation' ? 'validation' : 'tool-call',
              id: `evidence-${task.id}`,
            },
          ],
          ...(task.kind === 'edit-session'
            ? { modifiedFiles: ['src/oauth-session.ts', 'src/server.ts'] }
            : {}),
        }
      },
    }
    const executor = new PersistentMissionExecutor({
      store: executionStore,
      executor: taskExecutor,
    })
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

  it("stops scheduling further tasks once the mission's owning grant's duration limit is exceeded", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'symbolwright-autonomy-coordinator-duration-'),
    )
    roots.push(root)
    const missionStore = new MissionStore({ workspaceRoot: root })
    const accessRuntime = new AccessRuntime({ workspaceRoot: root })
    const { grant } = accessRuntime.grantService.createGrant({
      principalType: 'coding-agent',
      displayName: 'Coder',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: { mode: 'installation', repositories: [], organizations: [] },
      executionLimits: { maxMissionDurationMinutes: 15 },
    })
    const storedMission: SymbolWrightMission = { ...mission(root), grantId: grant.id }
    missionStore.createMission(storedMission)
    const missionService = new MissionService({ workspaceRoot: root, store: missionStore })
    const executionStore = new JsonMissionExecutionStore(root)

    let currentTime = Date.parse('2026-07-22T00:10:00.000Z')
    const taskExecutor: MissionTaskExecutor = {
      async execute(task) {
        currentTime += 10 * 60_000 // each task takes 10 simulated minutes; the cap is 15.
        return {
          state: 'completed',
          ...(task.kind === 'edit-session'
            ? { modifiedFiles: ['src/oauth-session.ts', 'src/server.ts'] }
            : {}),
        }
      },
    }
    const executor = new PersistentMissionExecutor({
      store: executionStore,
      executor: taskExecutor,
      now: () => new Date(currentTime),
    })
    const coordinator = new AutonomousMissionCoordinator({
      missionService,
      executor,
      executionStore,
      loadSemanticIndex: async () => semanticIndex(root),
      validationCommands: ['npm run typecheck', 'npm test'],
      accessRuntime,
      now: () => new Date(currentTime),
    })

    const result = await coordinator.start(storedMission.id)

    expect(result.execution.completedAt).toBeDefined()
    const states = result.execution.graph.tasks.map((task) => task.state)
    expect(states).toContain('failed')
    expect(states.filter((state) => state === 'completed').length).toBeLessThan(6)
    const failedTask = result.execution.graph.tasks.find((task) => task.state === 'failed')
    expect(
      failedTask?.failureDiagnostics.some((diagnostic) =>
        diagnostic.includes('exceeded its configured duration limit'),
      ),
    ).toBe(true)
  })
})

describe('resolveMaxMissionDurationMinutes', () => {
  let root: string
  let accessRuntime: AccessRuntime

  const REPO_SCOPE: RepositoryScope = {
    mode: 'installation',
    repositories: [],
    organizations: [],
  }

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  async function setup(): Promise<void> {
    root = await mkdtemp(path.join(os.tmpdir(), 'symbolwright-mission-duration-resolve-'))
    accessRuntime = new AccessRuntime({ workspaceRoot: root })
  }

  it('falls back to the global cap when the mission has no grant', async () => {
    await setup()
    const noGrantMission = mission(root)
    expect(
      resolveMaxMissionDurationMinutes(noGrantMission, { maxDurationMinutes: 45, accessRuntime }),
    ).toBe(45)
  })

  it('returns undefined when neither a global nor a grant cap is set', async () => {
    await setup()
    expect(resolveMaxMissionDurationMinutes(mission(root), {})).toBeUndefined()
  })

  it("uses the grant's cap when the global option is unset", async () => {
    await setup()
    const { grant } = accessRuntime.grantService.createGrant({
      principalType: 'coding-agent',
      displayName: 'Coder',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: REPO_SCOPE,
      executionLimits: { maxMissionDurationMinutes: 20 },
    })
    const grantMission: SymbolWrightMission = { ...mission(root), grantId: grant.id }
    expect(resolveMaxMissionDurationMinutes(grantMission, { accessRuntime })).toBe(20)
  })

  it('takes the smaller of the global and grant caps — a grant can only tighten, never loosen', async () => {
    await setup()
    const { grant } = accessRuntime.grantService.createGrant({
      principalType: 'coding-agent',
      displayName: 'Coder',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: REPO_SCOPE,
      executionLimits: { maxMissionDurationMinutes: 10 },
    })
    const grantMission: SymbolWrightMission = { ...mission(root), grantId: grant.id }
    expect(
      resolveMaxMissionDurationMinutes(grantMission, { maxDurationMinutes: 90, accessRuntime }),
    ).toBe(10)
    expect(
      resolveMaxMissionDurationMinutes(grantMission, { maxDurationMinutes: 5, accessRuntime }),
    ).toBe(5)
  })

  it('ignores the grant when accessRuntime is not supplied, even if the mission has a grantId', async () => {
    await setup()
    const grantMission: SymbolWrightMission = { ...mission(root), grantId: 'some-grant-id' }
    expect(resolveMaxMissionDurationMinutes(grantMission, { maxDurationMinutes: 30 })).toBe(30)
  })
})
