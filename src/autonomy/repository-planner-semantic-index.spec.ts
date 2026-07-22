import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { planAutonomousRepositoryMission } from './autonomous-repository-planner.js'
import { buildRepositorySemanticIndex, queryRepositoryIndex } from './repository-semantic-index.js'
import { RepositorySemanticIndexStore } from './repository-semantic-index-store.js'
import { validateAutonomousTaskGraph } from './task-graph.js'

describe('repository planner and semantic index', () => {
  it('indexes definitions, imports, references, and generated files', () => {
    const root = '/repo'
    const index = buildRepositorySemanticIndex(
      root,
      [
        {
          absolutePath: '/repo/src/auth-service.ts',
          content: 'export class AuthService { login() { return true } }',
          packageOwner: 'core',
        },
        {
          absolutePath: '/repo/src/api.ts',
          content: "import { AuthService } from './auth-service.js'\nnew AuthService()",
          packageOwner: 'api',
        },
        {
          absolutePath: '/repo/dist/generated.js',
          content: 'export const generated = true',
        },
      ],
      '2026-07-22T12:00:00.000Z',
    )

    const result = queryRepositoryIndex(index, 'AuthService')
    expect(result.definitions).toHaveLength(1)
    expect(result.references.map((entry) => entry.filePath)).toContain('src/api.ts')
    expect(result.importers).toContain('src/api.ts')
    expect(index.files.find((file) => file.path === 'dist/generated.js')?.generated).toBe(true)
  })

  it('creates an executable graph from semantic impact', () => {
    const index = buildRepositorySemanticIndex('/repo', [
      {
        absolutePath: '/repo/src/auth-service.ts',
        content: 'export class AuthService {}',
      },
      {
        absolutePath: '/repo/src/api.ts',
        content: "import { AuthService } from './auth-service.js'\nnew AuthService()",
      },
    ])

    const plan = planAutonomousRepositoryMission({
      missionId: 'mission-oauth',
      objective: 'Extend AuthService with OAuth support',
      repositoryRoot: '/repo',
      index,
      validationCommands: ['npm run typecheck', 'npm test'],
      now: '2026-07-22T12:00:00.000Z',
    })

    expect(plan.matchedSymbols).toContain('AuthService')
    expect(plan.affectedFiles).toEqual(['src/api.ts', 'src/auth-service.ts'])
    expect(plan.graph.tasks.filter((task) => task.state === 'ready')).toHaveLength(3)
    expect(plan.graph.tasks.find((task) => task.id === 'validate-2')?.dependencies).toEqual([
      'validate-1',
    ])
    expect(validateAutonomousTaskGraph(plan.graph).valid).toBe(true)
  })

  it('persists and reloads an index atomically', async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), 'codemind-index-'))
    const store = new RepositorySemanticIndexStore(stateRoot)
    const index = buildRepositorySemanticIndex('/repo', [
      { absolutePath: '/repo/src/index.ts', content: 'export function run() {}' },
    ])

    const savedPath = await store.save('owner/repo', index)
    const loaded = await store.load('owner/repo')

    expect(loaded).toEqual(index)
    expect(JSON.parse(await readFile(savedPath, 'utf8'))).toEqual(index)
  })
})
