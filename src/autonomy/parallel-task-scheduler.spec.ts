import { describe, expect, it } from 'vitest'
import { selectRunnableTaskBatch, tasksConflict } from './parallel-task-scheduler.js'
import type { AutonomousTaskGraph, AutonomousTaskNode } from './task-graph.types.js'

function task(
  id: string,
  options: Partial<AutonomousTaskNode> = {},
): AutonomousTaskNode {
  return {
    id,
    objective: id,
    kind: 'repository-analysis',
    dependencies: [],
    resources: { reads: [], writes: [] },
    state: 'queued',
    retry: { maxAttempts: 3, attempts: 0 },
    evidence: [],
    artifacts: [],
    failureDiagnostics: [],
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
    ...options,
  }
}

function graph(tasks: readonly AutonomousTaskNode[]): AutonomousTaskGraph {
  return {
    schemaVersion: 1,
    missionId: 'mission-1',
    objective: 'Autonomous repository engineering',
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
    tasks,
  }
}

describe('parallel task scheduler', () => {
  it('runs independent repository analysis tasks in parallel', () => {
    const result = selectRunnableTaskBatch(
      graph([
        task('index', { resources: { reads: ['src'], writes: ['.codemind/index'] } }),
        task('docs', { resources: { reads: ['README.md'], writes: [] } }),
        task('diagnostics', { resources: { reads: ['package.json'], writes: [] } }),
      ]),
      3,
    )

    expect(result.taskIds).toEqual(['index', 'docs', 'diagnostics'])
    expect(result.deferredTaskIds).toEqual([])
  })

  it('does not parallelize tasks with overlapping writes', () => {
    const result = selectRunnableTaskBatch(
      graph([
        task('edit-auth', { resources: { reads: ['src/auth'], writes: ['src/auth'] } }),
        task('edit-login', {
          resources: { reads: ['src/auth/login.ts'], writes: ['src/auth/login.ts'] },
        }),
        task('edit-docs', { resources: { reads: ['docs'], writes: ['docs/oauth.md'] } }),
      ]),
      3,
    )

    expect(result.taskIds).toEqual(['edit-auth', 'edit-docs'])
    expect(result.deferredTaskIds).toEqual(['edit-login'])
  })

  it('waits for dependencies and respects retry exhaustion', () => {
    const result = selectRunnableTaskBatch(
      graph([
        task('analysis', { state: 'completed' }),
        task('edit', { dependencies: ['analysis'] }),
        task('validate', { dependencies: ['edit'] }),
        task('exhausted', { retry: { maxAttempts: 2, attempts: 2 } }),
      ]),
      4,
    )

    expect(result.taskIds).toEqual(['edit'])
  })

  it('detects read-write conflicts across directory boundaries', () => {
    expect(
      tasksConflict(
        task('writer', { resources: { reads: [], writes: ['./src/auth'] } }),
        task('reader', { resources: { reads: ['src/auth/token.ts'], writes: [] } }),
      ),
    ).toBe(true)
  })
})
