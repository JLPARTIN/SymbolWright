import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProjectMemory } from '../memory/project-memory.js'
import { JsonAutonomousRepairLoopStore } from './autonomous-repair-loop.js'
import {
  JsonMissionExecutionStore,
  PersistentMissionExecutor,
} from './persistent-mission-executor.js'
import { PersistentMissionRepairController } from './persistent-mission-repair-controller.js'
import { RuntimeMissionTaskExecutor } from './runtime-mission-task-executor.js'
import type { AutonomousTaskGraph, AutonomousTaskNode } from './task-graph.types.js'

const roots: string[] = []
const NOW = '2026-07-23T22:00:00.000Z'

async function workspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'codemind-persistent-repair-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('persistent mission repair and repository learning', () => {
  it('repairs a failed validation, replays the full chain, and records reusable memory', async () => {
    const root = await workspace()
    const validationCalls: string[] = []
    let testAttempts = 0
    const validationRunner = {
      async run(input: { readonly phase: string; readonly command: string }) {
        validationCalls.push(input.command)
        const failed = input.command === 'npm test' && testAttempts++ === 0
        return {
          phase: input.phase,
          command: input.command,
          passed: !failed,
          exitCode: failed ? 1 : 0,
          stdout: failed ? '' : 'ok',
          stderr: failed ? 'src/result.ts: expected fixed result' : '',
          durationMs: 4,
        }
      },
    }
    const repairTasks: AutonomousTaskNode[] = []
    const editExecutor = {
      async execute(
        task: AutonomousTaskNode,
        context?: { readonly ownedBaselineFiles?: readonly string[] },
      ) {
        if (task.kind === 'repair') {
          repairTasks.push(task)
          expect(context?.ownedBaselineFiles).toEqual(['src/result.ts'])
          expect(task.objective).toContain('Relevant repository memory')
          return {
            state: 'completed' as const,
            modifiedFiles: ['src/result.ts'],
            evidence: [{ kind: 'tool-call' as const, id: 'repair-tool' }],
            artifacts: ['repair applied'],
          }
        }
        return {
          state: 'completed' as const,
          modifiedFiles: ['src/result.ts'],
          evidence: [{ kind: 'edit-session' as const, id: 'initial-edit' }],
        }
      },
    }
    const repairStore = new JsonAutonomousRepairLoopStore(root)
    const projectMemory = new ProjectMemory(path.join(root, 'repository-memory'))
    const events: string[] = []
    const repairController = new PersistentMissionRepairController({
      store: repairStore,
      editExecutor,
      projectMemory,
      missionId: 'mission-repair-learning',
      objective: 'Fix the result implementation',
      repositoryRoot: root,
      validationCommands: ['npm run typecheck', 'npm test'],
      recordEvent: (type) => events.push(type),
    })
    const runtimeExecutor = new RuntimeMissionTaskExecutor({
      repositoryRoot: root,
      validationRunner,
      editExecutor,
      repairController,
    })
    const executor = new PersistentMissionExecutor({
      store: new JsonMissionExecutionStore(root),
      executor: runtimeExecutor,
    })

    const result = await executor.start(graph())

    expect(result.completedAt).toBeDefined()
    expect(result.graph.tasks.map((task) => task.state)).toEqual([
      'completed',
      'completed',
      'completed',
    ])
    expect(result.graph.tasks[1]?.retry.attempts).toBe(2)
    expect(result.graph.tasks[2]?.retry.attempts).toBe(2)
    expect(validationCalls).toEqual([
      'npm run typecheck',
      'npm test',
      'npm run typecheck',
      'npm test',
    ])
    expect(repairTasks).toHaveLength(1)

    const repairRecord = await repairStore.load('repair-mission-repair-learning')
    expect(repairRecord).toMatchObject({ state: 'completed', modifiedFiles: ['src/result.ts'] })
    expect(repairRecord?.repairAttempts).toHaveLength(1)
    expect(repairRecord?.repairAttempts[0]).toMatchObject({
      executorState: 'completed',
      evidenceIds: ['repair-tool'],
    })

    expect(projectMemory.recall('error_pattern')).toHaveLength(1)
    expect(projectMemory.recall('test_pattern').map((entry) => entry.key)).toEqual([
      'validation:npm run typecheck',
      'validation:npm test',
    ])
    expect(projectMemory.recall('review_lesson')[0]?.value).toContain(
      'Validation recovered after 1 repair attempt',
    )
    expect(events).toContain('autonomy.repair.started')
    expect(events).toContain('autonomy.repair.applied')
    expect(events).toContain('autonomy.repair.learned')
  })

  it('persists exhausted repair state for a restarted runtime', async () => {
    const root = await workspace()
    const repairStore = new JsonAutonomousRepairLoopStore(root)
    const editExecutor = {
      execute: vi.fn(async (task: AutonomousTaskNode) =>
        task.kind === 'repair'
          ? {
              state: 'failed' as const,
              diagnostics: ['repair provider failed'],
              evidence: [{ kind: 'diagnostic' as const, id: 'repair-failed' }],
            }
          : { state: 'completed' as const, modifiedFiles: ['src/result.ts'] },
      ),
    }
    const controller = new PersistentMissionRepairController({
      store: repairStore,
      editExecutor,
      projectMemory: new ProjectMemory(path.join(root, 'memory')),
      missionId: 'mission-exhausted',
      objective: 'Repair a failing validation',
      repositoryRoot: root,
      validationCommands: ['npm test'],
      maxRepairAttempts: 1,
    })
    const runtime = new RuntimeMissionTaskExecutor({
      repositoryRoot: root,
      validationRunner: {
        async run(input) {
          return {
            phase: input.phase,
            command: input.command,
            passed: false,
            exitCode: 1,
            stdout: '',
            stderr: 'still broken',
            durationMs: 1,
          }
        },
      },
      editExecutor,
      repairController: controller,
    })
    const executor = new PersistentMissionExecutor({
      store: new JsonMissionExecutionStore(root),
      executor: runtime,
    })

    const failed = await executor.start(singleValidationGraph())
    expect(failed.graph.tasks.at(-1)?.state).toBe('failed')

    const restartedStore = new JsonAutonomousRepairLoopStore(root)
    const persisted = await restartedStore.load('repair-mission-exhausted')
    expect(persisted).toMatchObject({
      state: 'failed',
      error: 'repair provider failed',
    })
    expect(persisted?.repairAttempts).toHaveLength(1)
  })
})

function graph(): AutonomousTaskGraph {
  return {
    schemaVersion: 1,
    missionId: 'mission-repair-learning',
    objective: 'Fix the result implementation',
    createdAt: NOW,
    updatedAt: NOW,
    tasks: [
      task('edit', 'edit-session', [], { reads: ['src/**'], writes: ['src/result.ts'] }),
      task('validate-1', 'validation', ['edit']),
      task('validate-2', 'validation', ['validate-1']),
    ],
  }
}

function singleValidationGraph(): AutonomousTaskGraph {
  return {
    schemaVersion: 1,
    missionId: 'mission-exhausted',
    objective: 'Repair a failing validation',
    createdAt: NOW,
    updatedAt: NOW,
    tasks: [
      task('edit', 'edit-session', [], { reads: ['src/**'], writes: ['src/result.ts'] }),
      task('validate-1', 'validation', ['edit']),
    ],
  }
}

function task(
  id: string,
  kind: AutonomousTaskNode['kind'],
  dependencies: readonly string[],
  resources: AutonomousTaskNode['resources'] = { reads: ['**/*'], writes: [] },
): AutonomousTaskNode {
  const command = id === 'validate-1' ? 'npm run typecheck' : 'npm test'
  return {
    id,
    objective: kind === 'validation' ? `Run ${command}` : 'Apply the repository change',
    kind,
    dependencies,
    resources,
    state: dependencies.length === 0 ? 'ready' : 'queued',
    retry: { maxAttempts: 4, attempts: 0 },
    evidence: [],
    artifacts: [],
    failureDiagnostics: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}
