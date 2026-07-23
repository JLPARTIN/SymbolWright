import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { planSemanticMultiFileEdit } from './semantic-edit-orchestrator.js'
import type { AutonomousTaskNode } from './task-graph.types.js'
import { TransactionalRepositoryEdit } from './transactional-repository-edit.js'

const roots: string[] = []
const NOW = '2026-07-23T22:30:00.000Z'

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('nested repository repair transactions', () => {
  it('restores mission-owned baseline content after a failed repair', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'codemind-repair-transaction-'))
    roots.push(root)
    const target = path.join(root, 'src/result.ts')
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, 'export const result = "mission-edit"\n')
    const manager = new TransactionalRepositoryEdit({
      repositoryRoot: root,
      readChangedFiles: async () => ['src/result.ts'],
    })
    const plan = planSemanticMultiFileEdit({ task: repairTask() })

    const start = await manager.begin(plan, {
      ownedBaselineFiles: ['src/result.ts'],
    })
    expect(start.state).toBe('ready')
    if (start.state !== 'ready') throw new Error('Expected a ready repair transaction.')

    await writeFile(target, 'export const result = "repair-attempt"\n')
    await expect(manager.inspect(start.transaction)).resolves.toEqual({
      modifiedFiles: ['src/result.ts'],
      unexpectedFiles: [],
    })
    await expect(manager.rollback(start.transaction)).resolves.toEqual(['src/result.ts'])
    await expect(readFile(target, 'utf8')).resolves.toBe('export const result = "mission-edit"\n')
  })

  it('continues to block overlapping operator changes that are not mission-owned', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'codemind-operator-conflict-'))
    roots.push(root)
    const target = path.join(root, 'src/result.ts')
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, 'export const result = "operator-edit"\n')
    const manager = new TransactionalRepositoryEdit({
      repositoryRoot: root,
      readChangedFiles: async () => ['src/result.ts'],
    })

    const start = await manager.begin(planSemanticMultiFileEdit({ task: repairTask() }))

    expect(start).toMatchObject({
      state: 'blocked',
      conflictingFiles: ['src/result.ts'],
    })
  })
})

function repairTask(): AutonomousTaskNode {
  return {
    id: 'repair-validate-1-1',
    objective: 'Repair the failing result validation',
    kind: 'repair',
    dependencies: [],
    resources: { reads: ['src/**'], writes: ['src/result.ts'] },
    state: 'ready',
    retry: { maxAttempts: 1, attempts: 0 },
    evidence: [],
    artifacts: [],
    failureDiagnostics: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}
