import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { MissionAcceptanceService } from './mission-acceptance-service.js'
import {
  JsonMissionExecutionStore,
  type PersistedMissionExecution,
} from './persistent-mission-executor.js'
import type { RepositorySemanticIndexSnapshot } from './repository-semantic-index.types.js'
import type { AutonomousTaskNode } from './task-graph.types.js'

const NOW = '2026-07-23T00:01:00.000Z'

function task(
  id: string,
  kind: AutonomousTaskNode['kind'],
  objective: string,
): AutonomousTaskNode {
  return {
    id,
    objective,
    kind,
    dependencies: [],
    resources: { reads: [], writes: [] },
    state: 'completed',
    retry: { maxAttempts: 2, attempts: 1 },
    evidence: [{ kind: kind === 'validation' ? 'validation' : 'edit-session', id: `${id}-1` }],
    artifacts: [],
    failureDiagnostics: [],
    createdAt: '2026-07-23T00:00:00.000Z',
    updatedAt: NOW,
    startedAt: '2026-07-23T00:00:00.000Z',
    completedAt: NOW,
  }
}

function execution(): PersistedMissionExecution {
  return {
    schemaVersion: 1,
    graph: {
      schemaVersion: 1,
      missionId: 'mission-acceptance-impact',
      objective: 'Change an isolated indexed file',
      createdAt: '2026-07-23T00:00:00.000Z',
      updatedAt: NOW,
      tasks: [
        task('edit', 'edit-session', 'Change isolated file'),
        task('validate', 'validation', 'Run npm test'),
      ],
    },
    modifiedFiles: ['src/isolated.ts'],
    startedAt: '2026-07-23T00:00:00.000Z',
    updatedAt: NOW,
    completedAt: NOW,
  }
}

function semanticIndex(): RepositorySemanticIndexSnapshot {
  return {
    schemaVersion: 1,
    repositoryRoot: '/repo',
    createdAt: '2026-07-23T00:00:00.000Z',
    updatedAt: NOW,
    files: [
      {
        path: 'src/isolated.ts',
        language: 'typescript',
        contentHash: 'isolated',
        generated: false,
        packageOwner: 'core',
        indexedAt: NOW,
      },
    ],
    symbols: [],
    imports: [],
    references: [],
  }
}

describe('MissionAcceptanceService', () => {
  it('loads semantic intelligence and persists an impact-aware acceptance packet', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'codemind-acceptance-service-'))
    await new JsonMissionExecutionStore(workspaceRoot).save(execution())
    const requestedRoots: string[] = []
    const service = new MissionAcceptanceService({
      workspaceRoot,
      repositoryRoot: '/repo',
      validationCommands: ['npm test'],
      loadSemanticIndex: async (repositoryRoot) => {
        requestedRoots.push(repositoryRoot)
        return semanticIndex()
      },
      now: () => new Date(NOW),
    })

    const result = await service.generate('mission-acceptance-impact')
    const persisted = JSON.parse(await readFile(result.path, 'utf8')) as {
      intelligence: { mergeReadiness: { decision: string } }
    }

    expect(requestedRoots).toEqual([path.resolve('/repo')])
    expect(result.packet.intelligence?.mergeReadiness.decision).toBe('ready')
    expect(result.packet.pullRequest.title).toBe(
      'feat(agent): complete mission mission-acceptance-impact',
    )
    expect(result.packet.pullRequest.body).toContain('Repository Intelligence')
    expect(persisted.intelligence.mergeReadiness.decision).toBe('ready')
  })
})
