import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { MultiAgentExecutionTracker } from './multi-agent-execution-tracker.js'
import { MultiAgentMissionStore } from './multi-agent-mission-runtime.js'
import type { PersistedMissionExecution } from './persistent-mission-executor.js'
import type { AutonomousTaskNode } from './task-graph.types.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })))
})

describe('multi-agent execution tracker', () => {
  it('persists specialist roles and states from the verified mission execution', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codemind-specialists-'))
    roots.push(root)
    const store = new MultiAgentMissionStore(root)
    const tracker = new MultiAgentExecutionTracker(store)
    const execution: PersistedMissionExecution = {
      schemaVersion: 1,
      graph: {
        schemaVersion: 1,
        missionId: 'mission-1',
        objective: 'Repair and validate the repository',
        createdAt: '2026-07-22T22:00:00.000Z',
        updatedAt: '2026-07-22T22:05:00.000Z',
        tasks: [
          task('analysis', 'repository-analysis', 'completed'),
          task('edit', 'edit-session', 'completed', ['src/a.ts']),
          task('validation', 'validation', 'failed'),
        ],
      },
      modifiedFiles: ['src/a.ts'],
      startedAt: '2026-07-22T22:00:00.000Z',
      updatedAt: '2026-07-22T22:05:00.000Z',
      completedAt: '2026-07-22T22:05:00.000Z',
    }

    const state = await tracker.synchronize(execution)

    expect(state.assignments.map((assignment) => assignment.role)).toEqual([
      'repository-analyst',
      'code-editor',
      'test-runner',
    ])
    expect(state.assignments.map((assignment) => assignment.status)).toEqual([
      'completed',
      'completed',
      'failed',
    ])
    expect(state.assignments[1]?.modifiedFiles).toEqual(['src/a.ts'])
    expect(await store.load('mission-1')).toEqual(state)
  })
})

function task(
  id: string,
  kind: AutonomousTaskNode['kind'],
  state: AutonomousTaskNode['state'],
  writes: readonly string[] = [],
): AutonomousTaskNode {
  return {
    id,
    objective: `${kind} objective`,
    kind,
    dependencies: [],
    resources: { reads: [], writes },
    state,
    retry: { maxAttempts: 2, attempts: 1 },
    evidence: [{ kind: 'tool-call', id: `${id}-evidence` }],
    artifacts: [],
    failureDiagnostics: state === 'failed' ? ['validation failed'] : [],
    createdAt: '2026-07-22T22:00:00.000Z',
    updatedAt: '2026-07-22T22:05:00.000Z',
    startedAt: '2026-07-22T22:01:00.000Z',
    ...(state === 'completed' ? { completedAt: '2026-07-22T22:02:00.000Z' } : {}),
  }
}
