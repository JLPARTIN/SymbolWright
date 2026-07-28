import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { AutonomousMissionControl } from './autonomous-mission-control.js'
import { MissionExecutionLock } from './mission-execution-lock.js'
import {
  JsonMissionExecutionStore,
  PersistentMissionExecutor,
  type MissionTaskExecutionResult,
  type PersistedMissionExecution,
} from './persistent-mission-executor.js'
import type { AutonomousTaskGraph, AutonomousTaskNode } from './task-graph.types.js'

const workspaces: string[] = []
const NOW = '2026-07-22T12:00:00.000Z'

function task(id: string, dependencies: readonly string[] = []): AutonomousTaskNode {
  return {
    id,
    objective: `Execute ${id}`,
    kind: 'repository-analysis',
    dependencies,
    resources: { reads: [], writes: [] },
    state: 'queued',
    retry: { maxAttempts: 2, attempts: 0 },
    evidence: [],
    artifacts: [],
    failureDiagnostics: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function graph(missionId: string, tasks: readonly AutonomousTaskNode[]): AutonomousTaskGraph {
  return {
    schemaVersion: 1,
    missionId,
    objective: 'Race the cancel button against a running task',
    createdAt: NOW,
    updatedAt: NOW,
    tasks,
  }
}

function fakeMissionService() {
  return { get: () => undefined, appendEvent: () => undefined } as never
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('cancel-during-task race (PR 2)', () => {
  it("Control's cancel wins over a task's own belated completion, even without the mutex", async () => {
    // Regression test for the exact race the review identified: the executor holds an in-memory
    // copy while a task runs, and a concurrent cancel used to be silently overwritten by the
    // task's own later save. Reload-under-lock in `#reconcileAfterTask` closes this by comparing
    // against the *freshest* persisted state immediately before writing, not the stale copy the
    // task started from.
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'symbolwright-cancel-race-'))
    workspaces.push(workspace)
    const store = new JsonMissionExecutionStore(workspace)
    const lock = new MissionExecutionLock()
    const missionId = 'mission-cancel-race'

    let releaseTask: (() => void) | undefined
    let resolveStarted!: () => void
    const started = new Promise<void>((resolve) => (resolveStarted = resolve))

    const executor = new PersistentMissionExecutor({
      store,
      lock,
      executor: {
        async execute(): Promise<MissionTaskExecutionResult> {
          resolveStarted()
          await new Promise<void>((resolve) => (releaseTask = resolve))
          // The task "finishes" with a normal successful result -- this must NOT overwrite the
          // concurrent cancellation that happens while it's in flight below.
          return { state: 'completed' }
        },
      },
    })

    const control = new AutonomousMissionControl({
      executionStore: store,
      missionService: fakeMissionService(),
      lock,
    })

    const runPromise = executor.start(graph(missionId, [task('t1')]))
    await started

    // Cancel while the task is still executing.
    const cancelled = await control.cancel(missionId)
    expect(cancelled.graph.tasks[0]?.state).toBe('cancelled')

    // Now let the task's own (stale) result resolve.
    releaseTask?.()
    const finalExecution = await runPromise

    expect(finalExecution.graph.tasks[0]?.state).toBe('cancelled')
  })

  it('cancel-during-save: a concurrent control mutation between the reload and the write still wins', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'symbolwright-cancel-save-race-'))
    workspaces.push(workspace)
    const store = new JsonMissionExecutionStore(workspace)
    const lock = new MissionExecutionLock()
    const missionId = 'mission-cancel-save-race'

    const executor = new PersistentMissionExecutor({
      store,
      lock,
      executor: {
        async execute(): Promise<MissionTaskExecutionResult> {
          return { state: 'completed' }
        },
      },
    })

    const control = new AutonomousMissionControl({
      executionStore: store,
      missionService: fakeMissionService(),
      lock,
    })

    await store.save({
      schemaVersion: 1,
      graph: graph(missionId, [task('t1')]),
      modifiedFiles: [],
      startedAt: NOW,
      updatedAt: NOW,
    })

    // Both operations queue on the same lock for the same mission id; because they share one
    // `MissionExecutionLock`, whichever acquires it first fully completes (reload + write) before
    // the other's callback even starts -- there is no window for a stale read.
    const [runResult, cancelResult] = await Promise.all([
      executor.run((await store.load(missionId))!),
      control.cancel(missionId),
    ])

    const finalState = await store.load(missionId)
    expect(finalState?.graph.tasks[0]?.state).toBe('cancelled')
    void runResult
    void cancelResult
  })
})

describe('MissionExecutionRunOptions.signal (PR 2)', () => {
  it('a pre-aborted signal stops run() before starting the next task', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'symbolwright-preaborted-'))
    workspaces.push(workspace)
    const store = new JsonMissionExecutionStore(workspace)
    const missionId = 'mission-preaborted'
    let executeCalls = 0

    const executor = new PersistentMissionExecutor({
      store,
      executor: {
        async execute(): Promise<MissionTaskExecutionResult> {
          executeCalls += 1
          return { state: 'completed' }
        },
      },
    })

    const controller = new AbortController()
    controller.abort('operator')

    const initial: PersistedMissionExecution = {
      schemaVersion: 1,
      graph: graph(missionId, [task('t1')]),
      modifiedFiles: [],
      startedAt: NOW,
      updatedAt: NOW,
    }
    await store.save(initial)

    const result = await executor.run(initial, { signal: controller.signal })

    expect(executeCalls).toBe(0)
    expect(result.cancellationReason).toBe('operator')
    expect(result.graph.tasks[0]?.state).toBe('interrupted')
  })
})
