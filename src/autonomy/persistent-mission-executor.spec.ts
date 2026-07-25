import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { projectMissionDashboard } from './mission-dashboard-projection.js'
import {
  JsonMissionExecutionStore,
  PersistentMissionExecutor,
  type PersistedMissionExecution,
} from './persistent-mission-executor.js'
import type { AutonomousTaskGraph, AutonomousTaskNode } from './task-graph.types.js'

const workspaces: string[] = []
const NOW = '2026-07-22T12:00:00.000Z'

function task(
  id: string,
  dependencies: readonly string[],
  state: AutonomousTaskNode['state'] = 'queued',
): AutonomousTaskNode {
  return {
    id,
    objective: `Execute ${id}`,
    kind: id.includes('validate') ? 'validation' : 'repository-analysis',
    dependencies,
    resources: { reads: [], writes: [] },
    state,
    retry: { maxAttempts: 2, attempts: 0 },
    evidence: [],
    artifacts: [],
    failureDiagnostics: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function graph(tasks: readonly AutonomousTaskNode[]): AutonomousTaskGraph {
  return {
    schemaVersion: 1,
    missionId: 'mission-restart-proof',
    objective: 'Complete repository work after restart',
    createdAt: NOW,
    updatedAt: NOW,
    tasks,
  }
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('persistent mission execution', () => {
  it('restores interrupted tasks, preserves completed work, and continues without relaunch', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'symbolwright-mission-executor-'))
    workspaces.push(workspace)
    const store = new JsonMissionExecutionStore(workspace)
    const persisted: PersistedMissionExecution = {
      schemaVersion: 1,
      graph: graph([
        {
          ...task('index', [], 'completed'),
          startedAt: '2026-07-22T12:00:01.000Z',
          completedAt: '2026-07-22T12:00:02.000Z',
        },
        {
          ...task('edit', ['index'], 'running'),
          startedAt: '2026-07-22T12:00:03.000Z',
        },
        task('validate', ['edit']),
      ]),
      modifiedFiles: ['src/index.ts'],
      startedAt: NOW,
      updatedAt: '2026-07-22T12:00:03.000Z',
    }
    await store.save(persisted)

    const calls: string[] = []
    const executor = new PersistentMissionExecutor({
      store,
      executor: {
        async execute(node) {
          calls.push(node.id)
          return {
            state: 'completed',
            evidence: [{ kind: 'tool-call', id: `evidence-${node.id}` }],
            modifiedFiles: node.id === 'edit' ? ['src/auth.ts', 'src/auth.spec.ts'] : [],
          }
        },
      },
    })

    const result = await executor.resume('mission-restart-proof')

    expect(calls).toEqual(['edit', 'validate'])
    expect(result.completedAt).toBeDefined()
    expect(result.graph.tasks.map((node) => node.state)).toEqual([
      'completed',
      'completed',
      'completed',
    ])
    expect(result.modifiedFiles).toEqual(['src/auth.spec.ts', 'src/auth.ts', 'src/index.ts'])

    const saved = JSON.parse(
      await readFile(
        path.join(workspace, '.symbolwright', 'autonomy', 'missions', 'mission-restart-proof.json'),
        'utf8',
      ),
    ) as PersistedMissionExecution
    expect(saved.completedAt).toBeDefined()
    expect(saved.graph.tasks[1]?.evidence).toContainEqual({
      kind: 'tool-call',
      id: 'evidence-edit',
    })
  })

  it('retries failed task execution and persists diagnostics before succeeding', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'symbolwright-mission-retry-'))
    workspaces.push(workspace)
    let attempts = 0
    const executor = new PersistentMissionExecutor({
      store: new JsonMissionExecutionStore(workspace),
      executor: {
        async execute() {
          attempts += 1
          if (attempts === 1) throw new Error('temporary repository lock')
          return { state: 'completed' }
        },
      },
    })

    const result = await executor.start(graph([task('edit', [])]))
    const completed = result.graph.tasks[0]

    expect(attempts).toBe(2)
    expect(completed?.state).toBe('completed')
    expect(completed?.retry.attempts).toBe(2)
    expect(completed?.failureDiagnostics).toEqual(['temporary repository lock'])
  })

  it('rejects missing executions and returns completed executions without relaunching tasks', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'symbolwright-mission-resume-'))
    workspaces.push(workspace)
    const store = new JsonMissionExecutionStore(workspace)
    const execute = vi.fn(async () => ({ state: 'completed' as const }))
    const executor = new PersistentMissionExecutor({ store, executor: { execute } })

    await expect(executor.resume('missing-mission')).rejects.toThrow(
      'Mission execution missing-mission was not found.',
    )

    const completed: PersistedMissionExecution = {
      schemaVersion: 1,
      graph: graph([task('done', [], 'completed')]),
      modifiedFiles: [],
      startedAt: NOW,
      updatedAt: NOW,
      completedAt: '2026-07-22T12:00:05.000Z',
    }
    await store.save(completed)

    expect(await executor.resume('mission-restart-proof')).toEqual(completed)
    expect(execute).not.toHaveBeenCalled()
  })

  it('persists terminal failure diagnostics for exhausted retries and non-Error throws', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'symbolwright-mission-failed-'))
    workspaces.push(workspace)
    const failedTask = {
      ...task('edit', [], 'ready'),
      retry: { maxAttempts: 1, attempts: 0 },
    }
    const executor = new PersistentMissionExecutor({
      store: new JsonMissionExecutionStore(workspace),
      executor: {
        async execute() {
          throw 'repository unavailable'
        },
      },
    })

    const result = await executor.start(graph([failedTask]))

    expect(result.completedAt).toBeDefined()
    expect(result.graph.tasks[0]?.state).toBe('failed')
    expect(result.graph.tasks[0]?.failureDiagnostics).toEqual(['repository unavailable'])
  })

  it('records blocked outcomes and executes repair tasks through the repairing state', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'symbolwright-mission-blocked-'))
    workspaces.push(workspace)
    const repairTask: AutonomousTaskNode = {
      ...task('repair', [], 'ready'),
      kind: 'repair',
    }
    const executor = new PersistentMissionExecutor({
      store: new JsonMissionExecutionStore(workspace),
      executor: {
        async execute(node) {
          expect(node.kind).toBe('repair')
          return {
            state: 'blocked',
            artifacts: ['repair-plan.json'],
            diagnostics: ['manual credential required'],
          }
        },
      },
    })

    const result = await executor.start(graph([repairTask]))

    expect(result.completedAt).toBeDefined()
    expect(result.graph.tasks[0]).toMatchObject({
      state: 'blocked',
      artifacts: ['repair-plan.json'],
      failureDiagnostics: ['manual credential required'],
    })
  })

  it('projects live task, repair, validation, file, timeline, duration, and ETA state', () => {
    const execution: PersistedMissionExecution = {
      schemaVersion: 1,
      graph: graph([
        {
          ...task('index', [], 'completed'),
          startedAt: '2026-07-22T12:00:01.000Z',
          completedAt: '2026-07-22T12:00:03.000Z',
        },
        { ...task('edit', ['index'], 'running'), startedAt: '2026-07-22T12:00:04.000Z' },
        task('validate', ['edit']),
      ]),
      modifiedFiles: ['src/index.ts'],
      startedAt: NOW,
      updatedAt: '2026-07-22T12:00:04.000Z',
    }
    const projection = projectMissionDashboard({
      execution,
      now: '2026-07-22T12:00:09.000Z',
    })

    expect(projection.status).toBe('running')
    expect(projection.taskCounts.completed).toBe(1)
    expect(projection.taskCounts.running).toBe(1)
    expect(projection.taskCounts.queued).toBe(1)
    expect(projection.modifiedFiles).toEqual(['src/index.ts'])
    expect(projection.durationMs).toBe(9_000)
    expect(projection.estimatedCompletionMs).toBe(18_000)
    expect(projection.timeline.map((entry) => entry.label)).toEqual([
      'Mission started',
      'Task started: Execute index',
      'Task completed: Execute index',
      'Task started: Execute edit',
    ])
  })
})
