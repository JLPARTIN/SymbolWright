import { describe, expect, it } from 'vitest'

import type { RepositorySemanticIndexSnapshot } from './repository-semantic-index.types.js'
import { planSemanticMultiFileEdit } from './semantic-edit-orchestrator.js'
import type { AutonomousTaskNode } from './task-graph.types.js'

const NOW = '2026-07-23T20:00:00.000Z'

function task(writes: readonly string[] = ['src/core.ts']): AutonomousTaskNode {
  return {
    id: 'edit-semantic-runtime',
    objective: 'Update runCore and its API consumers',
    kind: 'edit-session',
    dependencies: [],
    resources: { reads: ['src/**'], writes },
    state: 'ready',
    retry: { maxAttempts: 2, attempts: 0 },
    evidence: [],
    artifacts: [],
    failureDiagnostics: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function index(): RepositorySemanticIndexSnapshot {
  return {
    schemaVersion: 1,
    repositoryRoot: '/repo',
    createdAt: NOW,
    updatedAt: NOW,
    files: [
      file('src/core.ts', 'core'),
      file('src/service.ts', 'services'),
      file('src/api.ts', 'api'),
      file('src/isolated.ts', 'core'),
    ],
    symbols: [
      {
        id: 'core:runCore',
        name: 'runCore',
        kind: 'function',
        filePath: 'src/core.ts',
        line: 1,
        exported: true,
      },
      {
        id: 'isolated:dashboardControl',
        name: 'dashboardControl',
        kind: 'function',
        filePath: 'src/isolated.ts',
        line: 1,
        exported: false,
      },
    ],
    imports: [
      { filePath: 'src/service.ts', source: './core.js', names: ['runCore'] },
      { filePath: 'src/api.ts', source: './service.js', names: ['service'] },
    ],
    references: [],
  }
}

function file(filePath: string, packageOwner: string) {
  return {
    path: filePath,
    language: 'typescript',
    contentHash: filePath,
    generated: false,
    packageOwner,
    indexedAt: NOW,
  }
}

describe('planSemanticMultiFileEdit', () => {
  it('orders dependency providers before direct and transitive importers', () => {
    const plan = planSemanticMultiFileEdit({
      task: task(),
      index: index(),
      validationCommands: ['npm test', 'npm run typecheck'],
    })

    expect(plan.writePolicy).toBe('declared')
    expect(plan.allowedWrites).toEqual(['src/api.ts', 'src/core.ts', 'src/service.ts'])
    expect(plan.orderedWrites).toEqual(['src/core.ts', 'src/service.ts', 'src/api.ts'])
    expect(plan.affectedImporters).toEqual(['src/api.ts', 'src/service.ts'])
    expect(plan.affectedPackages).toEqual(['api', 'core', 'services'])
    expect(plan.exportedSymbols).toEqual(['runCore'])
    expect(plan.phases.map((phase) => phase.id)).toEqual(['inspect', 'edit', 'verify'])
    expect(plan.phases[0]?.parallel).toBe(true)
    expect(plan.phases[1]?.parallel).toBe(false)
  })

  it('uses objective-matched semantic files when no write path was declared', () => {
    const plan = planSemanticMultiFileEdit({
      task: {
        ...task([]),
        objective: 'Improve dashboardControl behavior',
      },
      index: index(),
    })

    expect(plan.writePolicy).toBe('discovery')
    expect(plan.orderedWrites).toEqual(['src/isolated.ts'])
    expect(plan.rationale.join(' ')).toContain('Prepared 1 dependency-ordered files')
  })

  it('preserves declared scope when the semantic index is unavailable', () => {
    const plan = planSemanticMultiFileEdit({
      task: task(['src/new-feature.ts']),
      validationCommands: ['npm test'],
    })

    expect(plan.allowedWrites).toEqual(['src/new-feature.ts'])
    expect(plan.orderedWrites).toEqual(['src/new-feature.ts'])
    expect(plan.validationCommands).toEqual(['npm test'])
    expect(plan.rationale).toContain(
      'No persisted semantic index was available; declared write scope remains authoritative.',
    )
  })
})
