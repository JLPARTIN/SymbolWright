import { describe, expect, it, vi } from 'vitest'

import { AutonomousMissionControl } from './autonomous-mission-control.js'
import type {
  MissionExecutionStore,
  PersistedMissionExecution,
} from './persistent-mission-executor.js'
import type { AutonomousTaskNode } from './task-graph.types.js'

const NOW = '2026-07-22T18:00:00.000Z'

function task(
  id: string,
  state: AutonomousTaskNode['state'],
  dependencies: readonly string[] = [],
): AutonomousTaskNode {
  return {
    id,
    objective: id,
    kind: id.includes('validate') ? 'validation' : 'edit-session',
    dependencies,
    resources: { reads: [], writes: [] },
    state,
    retry: { maxAttempts: 2, attempts: state === 'failed' ? 2 : 0 },
    evidence: [],
    artifacts: [],
    failureDiagnostics: state === 'failed' ? ['failure'] : [],
    createdAt: NOW,
    updatedAt: NOW,
    ...(state === 'failed' || state === 'completed' ? { completedAt: NOW } : {}),
  }
}

function execution(tasks: readonly AutonomousTaskNode[]): PersistedMissionExecution {
  return {
    schemaVersion: 1,
    graph: {
      schemaVersion: 1,
      missionId: 'mission-control',
      objective: 'Control an autonomous mission',
      tasks,
      createdAt: NOW,
      updatedAt: NOW,
    },
    modifiedFiles: ['src/changed.ts'],
    startedAt: NOW,
    updatedAt: NOW,
  }
}

class MemoryExecutionStore implements MissionExecutionStore {
  value: PersistedMissionExecution | undefined

  constructor(value?: PersistedMissionExecution) {
    this.value = value
  }

  async load(): Promise<PersistedMissionExecution | undefined> {
    return this.value
  }

  async save(value: PersistedMissionExecution): Promise<void> {
    this.value = structuredClone(value)
  }
}

function missionService() {
  return {
    get: vi.fn(() => ({ id: 'mission-control' })),
    appendEvent: vi.fn(),
  }
}

describe('AutonomousMissionControl', () => {
  it('pauses active tasks without disturbing completed or queued work', async () => {
    const store = new MemoryExecutionStore(
      execution([task('done', 'completed'), task('edit', 'running'), task('next', 'queued')]),
    )
    const service = missionService()
    const control = new AutonomousMissionControl({
      executionStore: store,
      missionService: service as never,
      now: () => new Date('2026-07-22T18:05:00.000Z'),
    })

    const result = await control.pause('mission-control')

    expect(result.graph.tasks.map((entry) => entry.state)).toEqual([
      'completed',
      'interrupted',
      'queued',
    ])
    expect(service.appendEvent).toHaveBeenCalledWith(
      'mission-control',
      'autonomy.control.pause',
      expect.any(String),
      expect.objectContaining({ modifiedFiles: ['src/changed.ts'] }),
    )
  })

  it('cancels pending and active tasks while preserving terminal evidence', async () => {
    const store = new MemoryExecutionStore(
      execution([
        task('done', 'completed'),
        task('edit', 'repairing'),
        task('validate', 'ready'),
        task('later', 'interrupted'),
      ]),
    )
    const control = new AutonomousMissionControl({
      executionStore: store,
      missionService: missionService() as never,
      now: () => new Date('2026-07-22T18:06:00.000Z'),
    })

    const result = await control.cancel('mission-control')

    expect(result.graph.tasks.map((entry) => entry.state)).toEqual([
      'completed',
      'cancelled',
      'cancelled',
      'cancelled',
    ])
  })

  it('requeues failed blocked and cancelled tasks and clears terminal completion', async () => {
    const failedExecution = {
      ...execution([
        task('root', 'failed'),
        task('dependent', 'blocked', ['root']),
        task('cancelled', 'cancelled'),
      ]),
      completedAt: NOW,
    }
    const store = new MemoryExecutionStore(failedExecution)
    const control = new AutonomousMissionControl({
      executionStore: store,
      missionService: missionService() as never,
      now: () => new Date('2026-07-22T18:07:00.000Z'),
    })

    const result = await control.retry('mission-control')

    expect(result.completedAt).toBeUndefined()
    expect(result.graph.tasks.map((entry) => entry.state)).toEqual(['ready', 'queued', 'ready'])
    expect(result.graph.tasks.every((entry) => entry.failureDiagnostics.length === 0)).toBe(true)
  })

  it('rejects missing executions and impossible transitions', async () => {
    const missing = new AutonomousMissionControl({
      executionStore: new MemoryExecutionStore(),
      missionService: missionService() as never,
    })
    await expect(missing.pause('mission-control')).rejects.toThrow('was not found')

    const completed = new AutonomousMissionControl({
      executionStore: new MemoryExecutionStore(execution([task('done', 'completed')])),
      missionService: missionService() as never,
    })
    await expect(completed.pause('mission-control')).rejects.toThrow('cannot pause')
  })
})
