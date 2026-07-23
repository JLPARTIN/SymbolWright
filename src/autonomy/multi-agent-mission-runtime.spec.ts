import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import type { AutonomousTaskNode } from './task-graph.types.js'
import {
  MultiAgentMissionRuntime,
  MultiAgentMissionStore,
  type SpecialistAgentExecutor,
} from './multi-agent-mission-runtime.js'

const NOW = '2026-07-22T22:00:00.000Z'

function task(input: {
  readonly id: string
  readonly objective: string
  readonly kind?: AutonomousTaskNode['kind']
  readonly dependencies?: readonly string[]
  readonly writes?: readonly string[]
}): AutonomousTaskNode {
  return {
    id: input.id,
    objective: input.objective,
    kind: input.kind ?? 'repository-analysis',
    dependencies: input.dependencies ?? [],
    resources: { reads: [], writes: input.writes ?? [] },
    state: 'queued',
    retry: { maxAttempts: 2, attempts: 0 },
    evidence: [],
    artifacts: [],
    failureDiagnostics: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

async function workspace(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'codemind-multi-agent-'))
}

describe('multi-agent mission runtime', () => {
  it('assigns specialist roles, runs independent work concurrently, and shares evidence', async () => {
    const root = await workspace()
    const calls: string[] = []
    const contexts: string[][] = []
    const executor: SpecialistAgentExecutor = {
      async execute({ role, task: assignedTask, sharedContext }) {
        calls.push(`${role}:${assignedTask.id}`)
        contexts.push([...sharedContext.completedTaskIds])
        return {
          state: 'completed',
          evidence: [{ kind: 'tool-call', id: `evidence-${assignedTask.id}` }],
          modifiedFiles: assignedTask.resources.writes,
        }
      },
    }
    const runtime = new MultiAgentMissionRuntime({
      workspaceRoot: root,
      executor,
      maxConcurrency: 2,
      now: () => new Date(NOW),
    })
    const tasks = [
      task({ id: 'analyze', objective: 'Inspect repository architecture' }),
      task({ id: 'docs', objective: 'Update README', kind: 'documentation', writes: ['README.md'] }),
      task({
        id: 'validate',
        objective: 'Run npm test',
        kind: 'validation',
        dependencies: ['analyze', 'docs'],
      }),
    ]

    const initialized = await runtime.initialize({
      missionId: 'mission-1',
      objective: 'Ship a documented feature',
      tasks,
    })
    expect(initialized.assignments.map((assignment) => assignment.role)).toEqual([
      'repository-analyst',
      'documentation-agent',
      'test-runner',
    ])

    const completed = await runtime.run('mission-1', tasks)

    expect(completed.assignments.every((assignment) => assignment.status === 'completed')).toBe(
      true,
    )
    expect(calls.slice(0, 2).sort()).toEqual([
      'documentation-agent:docs',
      'repository-analyst:analyze',
    ])
    expect(calls[2]).toBe('test-runner:validate')
    expect(contexts[2]?.sort()).toEqual(['analyze', 'docs'])
    expect((await runtime.load('mission-1')).assignments).toEqual(completed.assignments)
  })

  it('persists blocked and failed specialist outcomes without false completion', async () => {
    const root = await workspace()
    const executor: SpecialistAgentExecutor = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({ state: 'blocked', diagnostics: ['needs approval'] })
        .mockRejectedValueOnce(new Error('specialist crashed')),
    }
    const runtime = new MultiAgentMissionRuntime({
      workspaceRoot: root,
      executor,
      maxConcurrency: 1,
      now: () => new Date(NOW),
    })
    const blockedTask = task({ id: 'edit', objective: 'Implement feature', kind: 'edit-session' })
    await runtime.initialize({ missionId: 'mission-blocked', objective: 'Edit', tasks: [blockedTask] })

    const blocked = await runtime.run('mission-blocked', [blockedTask])
    expect(blocked.assignments[0]).toMatchObject({
      role: 'code-editor',
      status: 'waiting',
      diagnostics: ['needs approval'],
    })

    const failedTask = task({ id: 'repair', objective: 'Repair build', kind: 'repair' })
    await runtime.initialize({ missionId: 'mission-failed', objective: 'Repair', tasks: [failedTask] })
    const failed = await runtime.run('mission-failed', [failedTask])
    expect(failed.assignments[0]).toMatchObject({
      role: 'repair-agent',
      status: 'failed',
      diagnostics: ['specialist crashed'],
    })
  })

  it('validates concurrency and mission identifiers', async () => {
    const root = await workspace()
    const executor: SpecialistAgentExecutor = { execute: vi.fn() }
    expect(
      () => new MultiAgentMissionRuntime({ workspaceRoot: root, executor, maxConcurrency: 0 }),
    ).toThrow('positive integer')

    const store = new MultiAgentMissionStore(root)
    await expect(store.load('../escape')).rejects.toThrow('Invalid mission ID')
  })
})
