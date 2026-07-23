import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from '../mission/mission-service.js'
import { MissionStore } from '../mission/mission-store.js'
import type { CodeMindMission } from '../mission/mission-types.js'
import { createAutonomousMissionRuntime } from './autonomous-mission-runtime.js'
import { planAutonomousRepositoryMission } from './autonomous-repository-planner.js'
import type { MissionTaskExecutor } from './persistent-mission-executor.js'
import { RepositorySemanticIndexStore } from './repository-semantic-index-store.js'
import type { RepositorySemanticIndexSnapshot } from './repository-semantic-index.types.js'

const roots: string[] = []
const MISSION_ID = 'mission_22222222-2222-4222-8222-222222222222'
const NOW = '2026-07-23T22:30:00.000Z'

interface Fixture {
  readonly root: string
  readonly mission: CodeMindMission
  readonly missionService: MissionService
  readonly index: RepositorySemanticIndexSnapshot
  readonly runtime: ReturnType<typeof createAutonomousMissionRuntime>
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('end-to-end autonomous mission release', () => {
  it('plans, executes, validates, assesses impact, generates PR evidence, and persists release state', async () => {
    const fixture = await createFixture()

    const release = await fixture.runtime.release.execute(fixture.mission.id)

    expect(release).toMatchObject({
      missionId: fixture.mission.id,
      state: 'merge-ready',
      nextAction: 'merge',
      executionMode: 'start',
      recovery: { resumed: false, interruptedTaskIds: [] },
    })
    expect(release.dashboard.status).toBe('completed')
    expect(release.acceptance.status).toBe('accepted')
    expect(release.acceptance.validation.passed).toBe(true)
    expect(release.acceptance.intelligence?.mergeReadiness.decision).toBe('ready')
    expect(release.acceptance.modifiedFiles).toEqual(['src/feature.ts'])
    expect(release.acceptance.evidence.length).toBeGreaterThan(0)
    expect(release.acceptance.pullRequest.title).toMatch(/^feat\(agent\):/)
    expect(release.acceptance.pullRequest.body).toContain('## Repository Intelligence')

    const storedRelease = JSON.parse(await readFile(releasePath(fixture.root), 'utf8')) as {
      state: string
      acceptance: { pullRequest: { title: string } }
    }
    expect(storedRelease.state).toBe('merge-ready')
    expect(storedRelease.acceptance.pullRequest.title).toBe(release.acceptance.pullRequest.title)
    await expect(readFile(release.acceptancePacketPath, 'utf8')).resolves.toContain(
      '"status": "accepted"',
    )

    const eventTypes = fixture.missionService
      .readEvents(fixture.mission.id)
      .map((event) => event.type)
    expect(eventTypes).toContain('autonomy.plan.created')
    expect(eventTypes).toContain('autonomy.execution.completed')
    expect(eventTypes).toContain('autonomy.release.generated')
  })

  it('resumes an interrupted persisted task graph and records restart recovery evidence', async () => {
    const fixture = await createFixture()
    const plan = planAutonomousRepositoryMission({
      missionId: fixture.mission.id,
      objective: fixture.mission.objective,
      repositoryRoot: fixture.root,
      index: fixture.index,
      validationCommands: ['npm run typecheck', 'npm test'],
      now: NOW,
    })
    const interruptedTask = plan.graph.tasks[0]
    if (interruptedTask === undefined) throw new Error('Expected an executable mission task.')
    await fixture.runtime.executionStore.save({
      schemaVersion: 1,
      graph: {
        ...plan.graph,
        tasks: plan.graph.tasks.map((task, index) =>
          index === 0
            ? {
                ...task,
                state: 'running',
                startedAt: '2026-07-23T22:31:00.000Z',
                updatedAt: '2026-07-23T22:31:00.000Z',
              }
            : task,
        ),
      },
      modifiedFiles: [],
      startedAt: '2026-07-23T22:30:00.000Z',
      updatedAt: '2026-07-23T22:31:00.000Z',
    })

    const release = await fixture.runtime.release.execute(fixture.mission.id)

    expect(release.executionMode).toBe('resume')
    expect(release.recovery).toEqual({
      resumed: true,
      interruptedTaskIds: [interruptedTask.id],
    })
    expect(release.dashboard.status).toBe('completed')
    expect(release.acceptance.status).toBe('accepted')
    expect(release.acceptance.taskSummary.completed).toBe(release.acceptance.taskSummary.total)
    await expect(fixture.runtime.release.load(fixture.mission.id)).resolves.toEqual(release)
  })
})

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'codemind-final-release-'))
  roots.push(root)
  const missionStore = new MissionStore({ workspaceRoot: root })
  const storedMission = mission(root)
  missionStore.createMission(storedMission)
  const missionService = new MissionService({ workspaceRoot: root, store: missionStore })
  const index = semanticIndex(root)
  await new RepositorySemanticIndexStore(path.join(root, '.codemind')).save(root, index)
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
        ...(task.kind === 'edit-session' ? { modifiedFiles: ['src/feature.ts'] } : {}),
      }
    },
  }
  const runtime = createAutonomousMissionRuntime({
    workspaceRoot: root,
    missionService,
    taskExecutor,
    validationCommands: ['npm run typecheck', 'npm test'],
    now: () => new Date('2026-07-23T22:40:00.000Z'),
  })
  return { root, mission: storedMission, missionService, index, runtime }
}

function mission(root: string): CodeMindMission {
  return {
    schemaVersion: 1,
    revision: 1,
    id: MISSION_ID,
    name: 'Final autonomous release proof',
    objective: 'Update feature implementation',
    status: 'ACTIVE',
    createdAt: NOW,
    updatedAt: NOW,
    lastOpenedAt: NOW,
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
  return {
    schemaVersion: 1,
    repositoryRoot: root,
    createdAt: NOW,
    updatedAt: NOW,
    files: [
      {
        path: 'src/feature.ts',
        language: 'typescript',
        contentHash: 'feature-hash',
        generated: false,
        packageOwner: 'codemind',
        indexedAt: NOW,
      },
    ],
    symbols: [
      {
        id: 'symbol-feature',
        name: 'Feature',
        kind: 'function',
        filePath: 'src/feature.ts',
        line: 1,
        exported: false,
      },
    ],
    imports: [],
    references: [],
  }
}

function releasePath(root: string): string {
  return path.join(root, '.codemind', 'autonomy', 'releases', `${MISSION_ID}.json`)
}
