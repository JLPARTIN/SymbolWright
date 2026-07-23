import { describe, expect, it } from 'vitest'

import type { PersistedMissionExecution } from './persistent-mission-executor.js'
import { createMissionImpactIntelligence } from './mission-impact-intelligence.js'
import type { RepositorySemanticIndexSnapshot } from './repository-semantic-index.types.js'
import type { AutonomousTaskNode } from './task-graph.types.js'

const STARTED_AT = '2026-07-23T00:00:00.000Z'
const COMPLETED_AT = '2026-07-23T00:01:00.000Z'

function task(input: {
  readonly id: string
  readonly kind: AutonomousTaskNode['kind']
  readonly objective: string
  readonly state?: AutonomousTaskNode['state']
  readonly diagnostics?: readonly string[]
}): AutonomousTaskNode {
  const state = input.state ?? 'completed'
  return {
    id: input.id,
    objective: input.objective,
    kind: input.kind,
    dependencies: [],
    resources: { reads: [], writes: [] },
    state,
    retry: { maxAttempts: 2, attempts: 1 },
    evidence: state === 'completed' ? [{ kind: 'validation', id: `${input.id}-evidence` }] : [],
    artifacts: [],
    failureDiagnostics: input.diagnostics ?? [],
    createdAt: STARTED_AT,
    updatedAt: COMPLETED_AT,
    startedAt: STARTED_AT,
    ...(state === 'completed' || state === 'failed' ? { completedAt: COMPLETED_AT } : {}),
  }
}

function execution(validation: AutonomousTaskNode): PersistedMissionExecution {
  return {
    schemaVersion: 1,
    graph: {
      schemaVersion: 1,
      missionId: 'mission-impact',
      objective: 'Change the exported core contract',
      createdAt: STARTED_AT,
      updatedAt: COMPLETED_AT,
      tasks: [
        task({ id: 'edit', kind: 'edit-session', objective: 'Change core contract' }),
        validation,
      ],
    },
    modifiedFiles: ['src/core.ts'],
    startedAt: STARTED_AT,
    updatedAt: COMPLETED_AT,
    completedAt: COMPLETED_AT,
  }
}

function semanticIndex(): RepositorySemanticIndexSnapshot {
  return {
    schemaVersion: 1,
    repositoryRoot: '/repo',
    createdAt: STARTED_AT,
    updatedAt: COMPLETED_AT,
    files: [
      file('src/core.ts', 'core'),
      file('src/service.ts', 'services'),
      file('src/api.ts', 'api'),
    ],
    symbols: [
      {
        id: 'core:run',
        name: 'runCore',
        kind: 'function',
        filePath: 'src/core.ts',
        line: 1,
        exported: true,
      },
    ],
    imports: [
      { filePath: 'src/service.ts', source: './core.js', names: ['runCore'] },
      { filePath: 'src/api.ts', source: './service.js', names: ['service'] },
    ],
    references: [],
  }
}

function file(path: string, packageOwner: string) {
  return {
    path,
    language: 'typescript',
    contentHash: path,
    generated: false,
    packageOwner,
    indexedAt: STARTED_AT,
  }
}

describe('createMissionImpactIntelligence', () => {
  it('combines persisted mission evidence with semantic dependency impact', () => {
    const result = createMissionImpactIntelligence({
      execution: execution(task({ id: 'validate', kind: 'validation', objective: 'Run npm test' })),
      semanticIndex: semanticIndex(),
      validationCommands: ['npm test'],
    })

    expect(result.impact.directlyAffectedFiles).toEqual(['src/service.ts'])
    expect(result.impact.transitivelyAffectedFiles).toEqual(['src/api.ts'])
    expect(result.impact.affectedPackages).toEqual(['api', 'core', 'services'])
    expect(result.mergeReadiness.decision).toBe('ready')
    expect(result.mergeReadiness.passedValidations).toEqual(['npm test'])
    expect(result.mergeReadiness.evidenceCount).toBe(2)
  })

  it('requires review while required validation is unfinished', () => {
    const result = createMissionImpactIntelligence({
      execution: execution(
        task({
          id: 'validate',
          kind: 'validation',
          objective: 'Run npm test',
          state: 'queued',
        }),
      ),
      semanticIndex: semanticIndex(),
      validationCommands: ['npm test'],
    })

    expect(result.mergeReadiness.decision).toBe('review-required')
    expect(result.mergeReadiness.missingValidations).toEqual(['npm test'])
  })

  it('blocks merge readiness when validation fails with diagnostics', () => {
    const result = createMissionImpactIntelligence({
      execution: execution(
        task({
          id: 'validate',
          kind: 'validation',
          objective: 'Run npm test',
          state: 'failed',
          diagnostics: ['1 test failed'],
        }),
      ),
      semanticIndex: semanticIndex(),
      validationCommands: ['npm test'],
    })

    expect(result.mergeReadiness.decision).toBe('blocked')
    expect(result.mergeReadiness.failedValidations).toEqual(['npm test'])
    expect(result.mergeReadiness.unresolvedDiagnostics).toEqual(['1 test failed'])
  })
})
