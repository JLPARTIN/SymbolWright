import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  MultiAgentExecutionTracker,
  roleForTask,
  specialistStatusForTask,
} from './multi-agent-execution-tracker.js'
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

  it('maps every supported task category and objective to a specialist role', () => {
    expect(roleForTask(task('edit', 'edit-session', 'ready'))).toBe('code-editor')
    expect(roleForTask(task('repair', 'repair', 'ready'))).toBe('repair-agent')
    expect(roleForTask(task('validation', 'validation', 'ready'))).toBe('test-runner')
    expect(roleForTask(task('docs', 'documentation', 'ready'))).toBe('documentation-agent')
    expect(
      roleForTask(
        task('pr', 'repository-analysis', 'ready', [], 'Create the pull request summary'),
      ),
    ).toBe('pr-summary-agent')
    expect(
      roleForTask(task('plan', 'repository-analysis', 'ready', [], 'Plan and decompose work')),
    ).toBe('planner')
    expect(roleForTask(task('analysis', 'repository-analysis', 'ready'))).toBe(
      'repository-analyst',
    )
  })

  it('maps every autonomous task state to a specialist status', () => {
    expect(specialistStatusForTask('completed')).toBe('completed')
    expect(specialistStatusForTask('failed')).toBe('failed')
    expect(specialistStatusForTask('cancelled')).toBe('failed')
    expect(specialistStatusForTask('blocked')).toBe('waiting')
    expect(specialistStatusForTask('interrupted')).toBe('waiting')
    expect(specialistStatusForTask('running')).toBe('running')
    expect(specialistStatusForTask('validating')).toBe('running')
    expect(specialistStatusForTask('repairing')).toBe('running')
    expect(specialistStatusForTask('queued')).toBe('idle')
    expect(specialistStatusForTask('ready')).toBe('idle')
  })

  it('attributes mission-wide modified files only to completed write tasks without declarations', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codemind-specialist-files-'))
    roots.push(root)
    const tracker = new MultiAgentExecutionTracker(new MultiAgentMissionStore(root))
    const execution: PersistedMissionExecution = {
      schemaVersion: 1,
      graph: {
        schemaVersion: 1,
        missionId: 'mission-files',
        objective: 'Attribute modified files',
        createdAt: '2026-07-22T22:00:00.000Z',
        updatedAt: '2026-07-22T22:05:00.000Z',
        tasks: [
          task('completed-edit', 'edit-session', 'completed'),
          task('completed-repair', 'repair', 'completed'),
          task('queued-edit', 'edit-session', 'queued'),
          task('analysis', 'repository-analysis', 'completed'),
        ],
      },
      modifiedFiles: ['src/a.ts', 'src/b.ts'],
      startedAt: '2026-07-22T22:00:00.000Z',
      updatedAt: '2026-07-22T22:05:00.000Z',
      completedAt: '2026-07-22T22:05:00.000Z',
    }

    const state = await tracker.synchronize(execution)

    expect(state.assignments.map((assignment) => assignment.modifiedFiles)).toEqual([
      ['src/a.ts', 'src/b.ts'],
      ['src/a.ts', 'src/b.ts'],
      [],
      [],
    ])
  })

  it('omits task timestamps when execution has not started or completed', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codemind-specialist-timestamps-'))
    roots.push(root)
    const tracker = new MultiAgentExecutionTracker(new MultiAgentMissionStore(root))
    const pendingTask = task('pending', 'repository-analysis', 'queued')
    const execution: PersistedMissionExecution = {
      schemaVersion: 1,
      graph: {
        schemaVersion: 1,
        missionId: 'mission-timestamps',
        objective: 'Track pending specialists',
        createdAt: '2026-07-22T22:00:00.000Z',
        updatedAt: '2026-07-22T22:05:00.000Z',
        tasks: [
          {
            ...pendingTask,
            startedAt: undefined,
            completedAt: undefined,
          },
        ],
      },
      modifiedFiles: [],
      startedAt: '2026-07-22T22:00:00.000Z',
      updatedAt: '2026-07-22T22:05:00.000Z',
    }

    const state = await tracker.synchronize(execution)

    expect(state.assignments[0]).not.toHaveProperty('startedAt')
    expect(state.assignments[0]).not.toHaveProperty('completedAt')
  })
})

function task(
  id: string,
  kind: AutonomousTaskNode['kind'],
  state: AutonomousTaskNode['state'],
  writes: readonly string[] = [],
  objective = `${kind} objective`,
): AutonomousTaskNode {
  return {
    id,
    objective,
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
