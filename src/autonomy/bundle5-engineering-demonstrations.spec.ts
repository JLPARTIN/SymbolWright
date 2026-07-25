import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

import {
  AutonomousRepairLoop,
  JsonAutonomousRepairLoopStore,
  type AutonomousRepairStrategy,
  type AutonomousValidationRunner,
} from './autonomous-repair-loop.js'
import {
  JsonMissionExecutionStore,
  PersistentMissionExecutor,
  type MissionTaskExecutor,
} from './persistent-mission-executor.js'
import {
  JsonTransactionalEditSessionStore,
  TransactionalEditSession,
  hashFileContent,
} from './transactional-edit-session.js'
import type { AutonomousTaskGraph } from './task-graph.types.js'

const executeFile = promisify(execFile)
const roots: string[] = []

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'symbolwright-bundle5-proof-'))
  roots.push(root)
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ scripts: { test: 'node test.mjs', build: 'node build.mjs' } }, null, 2),
  )
  await writeFile(path.join(root, 'math.mjs'), 'export const add = (a, b) => a - b\n')
  await writeFile(
    path.join(root, 'test.mjs'),
    "import { add } from './math.mjs'\nif (add(2, 3) !== 5) process.exit(1)\n",
  )
  await writeFile(
    path.join(root, 'build.mjs'),
    "import { add } from './math.mjs'\nif (typeof add !== 'function') process.exit(1)\n",
  )
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

class NodeValidationRunner implements AutonomousValidationRunner {
  async run(input: { repositoryRoot: string; phase: string; command: string }) {
    const started = Date.now()
    try {
      const result = await executeFile('npm', ['run', input.command], { cwd: input.repositoryRoot })
      return {
        phase: input.phase,
        command: input.command,
        passed: true,
        exitCode: 0,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: Date.now() - started,
      }
    } catch (error) {
      const failure = error as { code?: number; stdout?: string; stderr?: string }
      return {
        phase: input.phase,
        command: input.command,
        passed: false,
        exitCode: typeof failure.code === 'number' ? failure.code : 1,
        stdout: failure.stdout ?? '',
        stderr: failure.stderr ?? '',
        durationMs: Date.now() - started,
      }
    }
  }
}

describe('Bundle #5 real engineering demonstrations', () => {
  it('repairs a genuine failing test and completes validation without operator intervention', async () => {
    const root = await fixture()
    const sessions = new TransactionalEditSession(new JsonTransactionalEditSessionStore(root))
    const strategy: AutonomousRepairStrategy = {
      async diagnose({ failure }) {
        return [`${failure.command} failed because the arithmetic implementation is incorrect.`]
      },
      async proposeEdits() {
        const current = await readFile(path.join(root, 'math.mjs'), 'utf8')
        return [
          {
            path: 'math.mjs',
            expectedHash: hashFileContent(current),
            content: 'export const add = (a, b) => a + b\n',
          },
        ]
      },
    }
    const loop = new AutonomousRepairLoop({
      store: new JsonAutonomousRepairLoopStore(root),
      editSessions: sessions,
      validationRunner: new NodeValidationRunner(),
      repairStrategy: strategy,
    })
    const record = await loop.create({
      id: 'repair-proof',
      missionId: 'mission-repair-proof',
      objective: 'Fix all failing tests',
      repositoryRoot: root,
      validationCommands: ['test', 'build'],
      maxRepairAttempts: 2,
    })

    const result = await loop.run(record)

    expect(result.state).toBe('completed')
    expect(result.repairAttempts).toHaveLength(1)
    expect(result.modifiedFiles).toEqual(['math.mjs'])
    expect(await readFile(path.join(root, 'math.mjs'), 'utf8')).toContain('a + b')
  })

  it('applies a transactional multi-file feature and repository-wide symbol refactor', async () => {
    const root = await fixture()
    const sessions = new TransactionalEditSession(new JsonTransactionalEditSessionStore(root))
    const math = await readFile(path.join(root, 'math.mjs'), 'utf8')
    const test = await readFile(path.join(root, 'test.mjs'), 'utf8')
    const build = await readFile(path.join(root, 'build.mjs'), 'utf8')
    const session = await sessions.create({
      id: 'multifile-feature-refactor',
      missionId: 'mission-multifile',
      repositoryRoot: root,
      edits: [
        {
          path: 'math.mjs',
          expectedHash: hashFileContent(math),
          content:
            'export const sum = (a, b) => a + b\nexport const double = value => sum(value, value)\n',
        },
        {
          path: 'test.mjs',
          expectedHash: hashFileContent(test),
          content:
            "import { double, sum } from './math.mjs'\nif (sum(2, 3) !== 5 || double(4) !== 8) process.exit(1)\n",
        },
        {
          path: 'build.mjs',
          expectedHash: hashFileContent(build),
          content:
            "import { sum } from './math.mjs'\nif (typeof sum !== 'function') process.exit(1)\n",
        },
      ],
    })

    const applied = await sessions.apply(session)
    const validation = new NodeValidationRunner()

    expect(applied.state).toBe('applied')
    expect(applied.appliedPaths).toEqual(['math.mjs', 'test.mjs', 'build.mjs'])
    expect(
      (await validation.run({ repositoryRoot: root, phase: 'test', command: 'test' })).passed,
    ).toBe(true)
    expect(
      (await validation.run({ repositoryRoot: root, phase: 'build', command: 'build' })).passed,
    ).toBe(true)
  })

  it('restores an interrupted mission and does not repeat completed work', async () => {
    const root = await fixture()
    const now = '2026-07-22T00:00:00.000Z'
    const graph: AutonomousTaskGraph = {
      schemaVersion: 1,
      missionId: 'mission-restart-proof',
      objective: 'Resume interrupted engineering mission',
      createdAt: now,
      updatedAt: now,
      tasks: [
        {
          id: 'analysis',
          objective: 'Analyze repository',
          kind: 'repository-analysis',
          dependencies: [],
          resources: { reads: ['**/*'], writes: [] },
          state: 'completed',
          retry: { maxAttempts: 1, attempts: 1 },
          evidence: [],
          artifacts: [],
          failureDiagnostics: [],
          createdAt: now,
          updatedAt: now,
          startedAt: now,
          completedAt: now,
        },
        {
          id: 'edit',
          objective: 'Apply feature',
          kind: 'edit-session',
          dependencies: ['analysis'],
          resources: { reads: ['math.mjs'], writes: ['math.mjs'] },
          state: 'running',
          retry: { maxAttempts: 2, attempts: 0 },
          evidence: [],
          artifacts: [],
          failureDiagnostics: [],
          createdAt: now,
          updatedAt: now,
          startedAt: now,
        },
      ],
    }
    const calls: string[] = []
    const taskExecutor: MissionTaskExecutor = {
      async execute(task) {
        calls.push(task.id)
        await writeFile(path.join(root, 'math.mjs'), 'export const add = (a, b) => a + b\n')
        return { state: 'completed', modifiedFiles: ['math.mjs'] }
      },
    }
    const store = new JsonMissionExecutionStore(root)
    await store.save({
      schemaVersion: 1,
      graph,
      modifiedFiles: [],
      startedAt: now,
      updatedAt: now,
    })

    const restarted = new PersistentMissionExecutor({ store, executor: taskExecutor })
    const result = await restarted.resume(graph.missionId)

    expect(calls).toEqual(['edit'])
    expect(result.completedAt).toBeDefined()
    expect(result.modifiedFiles).toEqual(['math.mjs'])
  })
})
