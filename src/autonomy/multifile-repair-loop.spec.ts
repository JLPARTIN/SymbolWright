import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  AutonomousRepairLoop,
  type AutonomousRepairLoopRecord,
  type AutonomousRepairLoopStore,
  type AutonomousRepairStrategy,
  type AutonomousValidationRunner,
} from './autonomous-repair-loop.js'
import {
  hashFileContent,
  JsonTransactionalEditSessionStore,
  TransactionalEditSession,
} from './transactional-edit-session.js'

const roots: string[] = []

async function workspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'codemind-autonomy-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

class MemoryRepairStore implements AutonomousRepairLoopStore {
  readonly records = new Map<string, AutonomousRepairLoopRecord>()

  async load(loopId: string): Promise<AutonomousRepairLoopRecord | undefined> {
    return this.records.get(loopId)
  }

  async save(record: AutonomousRepairLoopRecord): Promise<void> {
    this.records.set(record.id, structuredClone(record))
  }
}

function passingValidationRunner(): AutonomousValidationRunner {
  return {
    async run(input) {
      return {
        phase: input.phase,
        command: input.command,
        passed: true,
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
        durationMs: 1,
      }
    },
  }
}

function noOpRepairStrategy(): AutonomousRepairStrategy {
  return {
    async diagnose() {
      return ['no repair required']
    },
    async proposeEdits() {
      return []
    },
  }
}

describe('transactional multi-file engineering', () => {
  it('applies multiple files atomically and detects stale-file conflicts', async () => {
    const root = await workspace()
    await mkdir(path.join(root, 'src'), { recursive: true })
    await writeFile(path.join(root, 'src/a.ts'), 'export const value = 1\n')
    await writeFile(path.join(root, 'src/b.ts'), 'export const other = 1\n')

    const sessions = new TransactionalEditSession(new JsonTransactionalEditSessionStore(root))
    const originalA = await readFile(path.join(root, 'src/a.ts'))
    const record = await sessions.create({
      id: 'multi-file',
      missionId: 'mission-1',
      repositoryRoot: root,
      edits: [
        {
          path: 'src/a.ts',
          content: 'export const value = 2\n',
          expectedHash: hashFileContent(originalA),
        },
        { path: 'src/b.ts', content: 'export const other = 2\n' },
      ],
    })

    const applied = await sessions.apply(record)
    expect(applied.state).toBe('applied')
    expect(applied.appliedPaths).toEqual(['src/a.ts', 'src/b.ts'])
    expect(await readFile(path.join(root, 'src/a.ts'), 'utf8')).toContain('value = 2')

    const stale = await sessions.create({
      id: 'stale-file',
      missionId: 'mission-1',
      repositoryRoot: root,
      edits: [
        {
          path: 'src/a.ts',
          content: 'export const value = 3\n',
          expectedHash: hashFileContent(originalA),
        },
      ],
    })
    const conflicted = await sessions.apply(stale)
    expect(conflicted.state).toBe('conflicted')
    expect(conflicted.conflicts).toEqual(['src/a.ts'])
  })

  it('rolls back earlier writes after a later edit fails', async () => {
    const root = await workspace()
    await mkdir(path.join(root, 'src/blocked.ts'), { recursive: true })
    await writeFile(path.join(root, 'src/first.ts'), 'before\n')

    const sessions = new TransactionalEditSession(new JsonTransactionalEditSessionStore(root))
    const record = await sessions.create({
      id: 'rollback',
      missionId: 'mission-2',
      repositoryRoot: root,
      edits: [
        { path: 'src/first.ts', content: 'after\n' },
        { path: 'src/blocked.ts', content: 'cannot replace directory\n' },
      ],
    })

    const result = await sessions.apply(record)
    expect(result.state).toBe('rolled-back')
    expect(result.appliedPaths).toEqual([])
    expect(await readFile(path.join(root, 'src/first.ts'), 'utf8')).toBe('before\n')
  })

  it('resumes a persisted planned edit session', async () => {
    const root = await workspace()
    const store = new JsonTransactionalEditSessionStore(root)
    const firstProcess = new TransactionalEditSession(store)
    await firstProcess.create({
      id: 'resume-edit',
      missionId: 'mission-3',
      repositoryRoot: root,
      edits: [{ path: 'src/resumed.ts', content: 'export const resumed = true\n' }],
    })

    const restartedProcess = new TransactionalEditSession(store)
    const resumed = await restartedProcess.resume('resume-edit')
    expect(resumed.state).toBe('applied')
    expect(await readFile(path.join(root, 'src/resumed.ts'), 'utf8')).toContain('resumed = true')
  })
})

describe('autonomous validation and repair', () => {
  it('diagnoses a real failed validation, applies a repair, and retries to success', async () => {
    const root = await workspace()
    await mkdir(path.join(root, 'src'), { recursive: true })
    const target = path.join(root, 'src/result.ts')
    await writeFile(target, 'export const result = "broken"\n')

    const validationRunner: AutonomousValidationRunner = {
      async run(input) {
        const started = Date.now()
        const content = await readFile(target, 'utf8')
        const passed = content.includes('"fixed"')
        return {
          phase: input.phase,
          command: input.command,
          passed,
          exitCode: passed ? 0 : 1,
          stdout: passed ? 'validation passed' : '',
          stderr: passed ? '' : 'Expected result to equal fixed',
          durationMs: Date.now() - started,
        }
      },
    }
    const repairStrategy: AutonomousRepairStrategy = {
      async diagnose(input) {
        return [`${input.failure.phase}: ${input.failure.stderr}`]
      },
      async proposeEdits() {
        return [
          {
            path: 'src/result.ts',
            content: 'export const result = "fixed"\n',
            expectedHash: hashFileContent(await readFile(target)),
          },
        ]
      },
    }
    const repairStore = new MemoryRepairStore()
    const loop = new AutonomousRepairLoop({
      store: repairStore,
      editSessions: new TransactionalEditSession(new JsonTransactionalEditSessionStore(root)),
      validationRunner,
      repairStrategy,
    })
    const planned = await loop.create({
      id: 'repair-proof',
      missionId: 'mission-4',
      objective: 'Repair the failing result validation',
      repositoryRoot: root,
      validationCommands: ['npm test'],
      maxRepairAttempts: 2,
    })

    const completed = await loop.run(planned)
    expect(completed.state).toBe('completed')
    expect(completed.repairAttempts).toHaveLength(1)
    expect(completed.validationResults.map((result) => result.passed)).toEqual([false, true])
    expect(completed.modifiedFiles).toEqual(['src/result.ts'])
    expect(await readFile(target, 'utf8')).toContain('"fixed"')
    expect(repairStore.records.get('repair-proof')?.state).toBe('completed')
  })

  it('rejects invalid loop configuration', async () => {
    const root = await workspace()
    const loop = new AutonomousRepairLoop({
      store: new MemoryRepairStore(),
      editSessions: new TransactionalEditSession(new JsonTransactionalEditSessionStore(root)),
      validationRunner: passingValidationRunner(),
      repairStrategy: noOpRepairStrategy(),
    })

    await expect(
      loop.create({
        missionId: 'mission-invalid-empty',
        objective: 'Invalid empty validation plan',
        repositoryRoot: root,
        validationCommands: [],
      }),
    ).rejects.toThrow('requires at least one validation command')

    await expect(
      loop.create({
        missionId: 'mission-invalid-retries',
        objective: 'Invalid retry count',
        repositoryRoot: root,
        validationCommands: ['npm test'],
        maxRepairAttempts: 11,
      }),
    ).rejects.toThrow('between 0 and 10')
  })

  it('fails immediately when the retry limit is zero', async () => {
    const root = await workspace()
    const validationRunner: AutonomousValidationRunner = {
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
    }
    const store = new MemoryRepairStore()
    const loop = new AutonomousRepairLoop({
      store,
      editSessions: new TransactionalEditSession(new JsonTransactionalEditSessionStore(root)),
      validationRunner,
      repairStrategy: noOpRepairStrategy(),
    })
    const planned = await loop.create({
      id: 'zero-retries',
      missionId: 'mission-zero-retries',
      objective: 'Fail without repair attempts',
      repositoryRoot: root,
      validationCommands: ['npm test'],
      maxRepairAttempts: 0,
    })

    const failed = await loop.run(planned)
    expect(failed.state).toBe('failed')
    expect(failed.repairAttempts).toHaveLength(0)
    expect(failed.error).toContain('retry limit reached')
  })

  it('records an empty-edit repair strategy as a failed attempt', async () => {
    const root = await workspace()
    const validationRunner: AutonomousValidationRunner = {
      async run(input) {
        return {
          phase: input.phase,
          command: input.command,
          passed: false,
          exitCode: 1,
          stdout: '',
          stderr: 'repair required',
          durationMs: 1,
        }
      },
    }
    const loop = new AutonomousRepairLoop({
      store: new MemoryRepairStore(),
      editSessions: new TransactionalEditSession(new JsonTransactionalEditSessionStore(root)),
      validationRunner,
      repairStrategy: noOpRepairStrategy(),
    })
    const planned = await loop.create({
      id: 'empty-edit-repair',
      missionId: 'mission-empty-edit',
      objective: 'Reject empty repair edits',
      repositoryRoot: root,
      validationCommands: ['npm test'],
      maxRepairAttempts: 1,
    })

    const failed = await loop.run(planned)
    expect(failed.state).toBe('failed')
    expect(failed.repairAttempts).toHaveLength(1)
    expect(failed.error).toBe('Repair strategy returned no edits.')
    expect(failed.repairAttempts[0]?.diagnosis).toEqual(['Repair strategy returned no edits.'])
  })

  it('reports missing loops and returns terminal loops without rerunning', async () => {
    const root = await workspace()
    const store = new MemoryRepairStore()
    const loop = new AutonomousRepairLoop({
      store,
      editSessions: new TransactionalEditSession(new JsonTransactionalEditSessionStore(root)),
      validationRunner: passingValidationRunner(),
      repairStrategy: noOpRepairStrategy(),
    })

    await expect(loop.resume('missing-loop')).rejects.toThrow('was not found')

    const completed = await loop.create({
      id: 'terminal-loop',
      missionId: 'mission-terminal',
      objective: 'Complete once',
      repositoryRoot: root,
      validationCommands: ['npm test'],
    })
    const terminal = await loop.run(completed)
    expect(terminal.state).toBe('completed')
    await expect(loop.resume('terminal-loop')).resolves.toEqual(terminal)
  })
})
