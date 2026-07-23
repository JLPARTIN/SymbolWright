import { describe, expect, it, vi } from 'vitest'

import type { SemanticEditPlan } from './semantic-edit-orchestrator.js'
import { TransactionalRepositoryEdit } from './transactional-repository-edit.js'

function plan(overrides: Partial<SemanticEditPlan> = {}): SemanticEditPlan {
  return {
    schemaVersion: 1,
    taskId: 'edit-1',
    objective: 'Change repository files',
    writePolicy: 'declared',
    declaredWrites: ['src/core.ts'],
    allowedWrites: ['src/core.ts'],
    orderedWrites: ['src/core.ts'],
    affectedImporters: [],
    affectedPackages: ['core'],
    exportedSymbols: [],
    validationCommands: ['npm test'],
    steps: [],
    phases: [],
    rationale: [],
    ...overrides,
  }
}

describe('TransactionalRepositoryEdit', () => {
  it('blocks an autonomous edit that overlaps pre-existing operator changes', async () => {
    const manager = new TransactionalRepositoryEdit({
      repositoryRoot: '/repo',
      readChangedFiles: vi.fn(async () => ['src/core.ts', 'notes.txt']),
    })

    const result = await manager.begin(plan())

    expect(result.state).toBe('blocked')
    if (result.state === 'blocked') {
      expect(result.conflictingFiles).toEqual(['src/core.ts'])
      expect(result.diagnostics.join(' ')).toContain('pre-existing repository changes')
    }
  })

  it('detects changes outside a declared semantic write scope', async () => {
    let changedFiles: readonly string[] = []
    const manager = new TransactionalRepositoryEdit({
      repositoryRoot: '/repo',
      readChangedFiles: vi.fn(async () => changedFiles),
    })
    const started = await manager.begin(plan())
    expect(started.state).toBe('ready')
    if (started.state !== 'ready') return

    changedFiles = ['src/core.ts', 'src/unplanned.ts']
    const inspection = await manager.inspect(started.transaction)

    expect(inspection.modifiedFiles).toEqual(['src/core.ts', 'src/unplanned.ts'])
    expect(inspection.unexpectedFiles).toEqual(['src/unplanned.ts'])
  })

  it('restores tracked files and removes untracked files introduced by the task', async () => {
    let changedFiles: readonly string[] = []
    const removed: string[] = []
    const runGit = vi.fn(async (args: readonly string[]) => {
      if (args[0] === 'ls-files' && args.at(-1) === 'src/core.ts') {
        return { stdout: 'src/core.ts\n', stderr: '', exitCode: 0 }
      }
      if (args[0] === 'ls-files') return { stdout: '', stderr: '', exitCode: 1 }
      return { stdout: '', stderr: '', exitCode: 0 }
    })
    const manager = new TransactionalRepositoryEdit({
      repositoryRoot: '/repo',
      readChangedFiles: vi.fn(async () => changedFiles),
      runGit,
      removePath: vi.fn(async (filePath) => {
        removed.push(filePath)
      }),
    })
    const started = await manager.begin(plan({ allowedWrites: ['src/core.ts', 'src/new.ts'] }))
    expect(started.state).toBe('ready')
    if (started.state !== 'ready') return

    changedFiles = ['src/core.ts', 'src/new.ts']
    const restored = await manager.rollback(started.transaction)

    expect(restored).toEqual(['src/core.ts', 'src/new.ts'])
    expect(runGit).toHaveBeenCalledWith(
      ['restore', '--staged', '--worktree', '--', 'src/core.ts'],
      '/repo',
    )
    expect(removed).toEqual(['src/new.ts'])
  })

  it('permits repository-driven discovery without flagging additional paths', async () => {
    let changedFiles: readonly string[] = []
    const manager = new TransactionalRepositoryEdit({
      repositoryRoot: '/repo',
      readChangedFiles: vi.fn(async () => changedFiles),
    })
    const started = await manager.begin(
      plan({ writePolicy: 'discovery', declaredWrites: [], allowedWrites: [] }),
    )
    expect(started.state).toBe('ready')
    if (started.state !== 'ready') return

    changedFiles = ['src/discovered.ts']
    const inspection = await manager.inspect(started.transaction)

    expect(inspection.modifiedFiles).toEqual(['src/discovered.ts'])
    expect(inspection.unexpectedFiles).toEqual([])
  })
})
