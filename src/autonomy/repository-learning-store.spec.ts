import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { JsonRepositoryLearningStore } from './repository-learning-store.js'

const workspaces: string[] = []

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('repository learning store', () => {
  it('records conventions, validation commands, successful fixes, and failed approaches', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'codemind-learning-'))
    workspaces.push(workspace)
    const store = new JsonRepositoryLearningStore(workspace)

    await store.record({
      repositoryId: 'codemind',
      objectivePattern: 'repair prettier formatting failure',
      validationPhase: 'format',
      diagnosis: ['Prettier reported three TypeScript files.'],
      strategy: 'Run Prettier only on affected files.',
      affectedFiles: ['src/a.ts', 'src/b.ts'],
      outcome: 'successful',
      attemptCount: 1,
      conventions: ['single quotes', 'no semicolons'],
      validationCommands: ['npm run format:check', 'npm run validate'],
      now: '2026-07-22T12:00:00.000Z',
    })
    const snapshot = await store.record({
      repositoryId: 'codemind',
      objectivePattern: 'repair prettier formatting failure',
      validationPhase: 'format',
      diagnosis: ['Formatting failure was misclassified as a type error.'],
      strategy: 'Change TypeScript compiler settings.',
      affectedFiles: ['tsconfig.json'],
      outcome: 'failed',
      attemptCount: 2,
      conventions: ['single quotes'],
      validationCommands: ['npm run format:check'],
      now: '2026-07-22T12:01:00.000Z',
    })

    expect(snapshot.conventions).toEqual(['no semicolons', 'single quotes'])
    expect(snapshot.validationCommands).toEqual(['npm run format:check', 'npm run validate'])
    expect(snapshot.entries).toHaveLength(2)
    expect(snapshot.entries.map((entry) => entry.outcome)).toEqual(['successful', 'failed'])
  })

  it('ranks successful reusable strategies above similar failed approaches and persists reuse', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'codemind-learning-rank-'))
    workspaces.push(workspace)
    const store = new JsonRepositoryLearningStore(workspace)

    await store.record({
      repositoryId: 'codemind',
      objectivePattern: 'fix sandbox go timeout during validation',
      validationPhase: 'test',
      diagnosis: ['Go compilation exceeded the runtime timeout.'],
      strategy: 'Separate compile and run phases and use compileTimeoutMs.',
      affectedFiles: ['src/sandbox/sandbox-guarded-host-backend.ts'],
      outcome: 'successful',
      attemptCount: 1,
      now: '2026-07-22T12:00:00.000Z',
    })
    await store.record({
      repositoryId: 'codemind',
      objectivePattern: 'fix sandbox go timeout during validation',
      validationPhase: 'test',
      diagnosis: ['The timeout was assumed to be random.'],
      strategy: 'Rerun CI without changing implementation.',
      affectedFiles: [],
      outcome: 'failed',
      attemptCount: 3,
      now: '2026-07-22T12:01:00.000Z',
    })

    const recommendations = await store.recommend({
      repositoryId: 'codemind',
      objective: 'repair go sandbox timeout in validation suite',
      validationPhase: 'test',
      now: '2026-07-22T12:02:00.000Z',
    })

    expect(recommendations).toHaveLength(2)
    expect(recommendations[0]?.outcome).toBe('successful')
    expect(recommendations[0]?.strategy).toContain('compile and run phases')
    expect(recommendations[0]?.useCount).toBe(1)

    const persisted = await store.load('codemind')
    expect(persisted.entries.find((entry) => entry.id === recommendations[0]?.id)?.useCount).toBe(1)
  })
})
