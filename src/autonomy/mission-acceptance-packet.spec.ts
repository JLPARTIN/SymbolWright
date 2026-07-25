import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { MissionImpactIntelligence } from './mission-impact-intelligence.js'
import {
  createMissionAcceptancePacket,
  MissionAcceptancePacketStore,
} from './mission-acceptance-packet.js'
import type { PersistedMissionExecution } from './persistent-mission-executor.js'
import type { AutonomousTaskNode } from './task-graph.types.js'

const STARTED_AT = '2026-07-23T00:00:00.000Z'
const COMPLETED_AT = '2026-07-23T00:02:00.000Z'

function task(input: {
  id: string
  kind?: AutonomousTaskNode['kind']
  state?: AutonomousTaskNode['state']
  objective?: string
  attempts?: number
  evidence?: AutonomousTaskNode['evidence']
  artifacts?: readonly string[]
  diagnostics?: readonly string[]
}): AutonomousTaskNode {
  return {
    id: input.id,
    objective: input.objective ?? input.id,
    kind: input.kind ?? 'repository-analysis',
    dependencies: [],
    resources: { reads: [], writes: [] },
    state: input.state ?? 'completed',
    retry: { maxAttempts: 3, attempts: input.attempts ?? 1 },
    evidence: input.evidence ?? [],
    artifacts: input.artifacts ?? [],
    failureDiagnostics: input.diagnostics ?? [],
    createdAt: STARTED_AT,
    updatedAt: COMPLETED_AT,
    startedAt: STARTED_AT,
    ...(input.state === 'completed' || input.state === undefined
      ? { completedAt: COMPLETED_AT }
      : {}),
  }
}

function execution(
  tasks: readonly AutonomousTaskNode[],
  options: { completed?: boolean; modifiedFiles?: readonly string[] } = {},
): PersistedMissionExecution {
  return {
    schemaVersion: 1,
    graph: {
      schemaVersion: 1,
      missionId: 'mission-42',
      objective: 'Implement and verify a multi-file feature',
      createdAt: STARTED_AT,
      updatedAt: COMPLETED_AT,
      tasks,
    },
    modifiedFiles: options.modifiedFiles ?? [],
    startedAt: STARTED_AT,
    updatedAt: COMPLETED_AT,
    ...(options.completed === false ? {} : { completedAt: COMPLETED_AT }),
  }
}

function readyIntelligence(): MissionImpactIntelligence {
  return {
    impact: {
      changedFiles: ['src/a.ts', 'src/b.ts'],
      directlyAffectedFiles: [],
      transitivelyAffectedFiles: [],
      affectedPackages: ['symbolwright'],
      affectedExportedSymbols: [],
      validationCommands: ['npm test'],
      risk: 'low',
      riskScore: 10,
      reasons: ['The change is isolated to indexed files with no known importers.'],
    },
    mergeReadiness: {
      decision: 'ready',
      score: 90,
      impactRisk: 'low',
      passedValidations: ['npm test'],
      failedValidations: [],
      missingValidations: [],
      unresolvedDiagnostics: [],
      evidenceCount: 2,
      reasons: ['Required validation and evidence gates are satisfied.'],
    },
  }
}

describe('mission acceptance packet', () => {
  it('accepts a completed validated mission with ready intelligence and generates a feature PR packet', () => {
    const packet = createMissionAcceptancePacket({
      execution: execution(
        [
          task({
            id: 'edit',
            kind: 'edit-session',
            evidence: [{ kind: 'edit-session', id: 'edit-1' }],
            artifacts: ['diff.patch'],
          }),
          task({
            id: 'validate',
            kind: 'validation',
            objective: 'Run npm test',
            evidence: [{ kind: 'validation', id: 'validation-1' }],
          }),
        ],
        { modifiedFiles: ['src/a.ts', 'src/b.ts'] },
      ),
      intelligence: readyIntelligence(),
      generatedAt: COMPLETED_AT,
    })

    expect(packet.status).toBe('accepted')
    expect(packet.validation).toEqual({
      passed: true,
      completedPhases: ['Run npm test'],
      failedPhases: [],
    })
    expect(packet.taskSummary).toMatchObject({ total: 2, completed: 2, attempts: 2 })
    expect(packet.evidence).toHaveLength(2)
    expect(packet.durationMs).toBe(120_000)
    expect(packet.pullRequest.title).toBe('feat(agent): complete mission mission-42')
    expect(packet.pullRequest.body).toContain('Validation passed: yes')
    expect(packet.pullRequest.body).toContain('`src/a.ts`')
  })

  it('does not generate a feature PR title when repository intelligence is unavailable', () => {
    const packet = createMissionAcceptancePacket({
      execution: execution([
        task({ id: 'validate', kind: 'validation', objective: 'Run npm test' }),
      ]),
      generatedAt: COMPLETED_AT,
    })

    expect(packet.status).toBe('accepted')
    expect(packet.validation.passed).toBe(true)
    expect(packet.intelligence).toBeNull()
    expect(packet.pullRequest.title).toBe('chore(agent): complete mission mission-42')
  })

  it.each([
    ['failed', task({ id: 'failure', state: 'failed', diagnostics: ['Tests failed'] })],
    ['blocked', task({ id: 'blocked', state: 'blocked' })],
    ['incomplete', task({ id: 'running', state: 'running' })],
  ] as const)('derives %s from persisted task state', (expected, selectedTask) => {
    const packet = createMissionAcceptancePacket({
      execution: execution([selectedTask], { completed: expected !== 'incomplete' }),
      generatedAt: COMPLETED_AT,
    })

    expect(packet.status).toBe(expected)
    expect(packet.pullRequest.title).toBe(`chore(agent): complete mission mission-42`)
  })

  it('records validation failures and diagnostics without claiming acceptance', () => {
    const packet = createMissionAcceptancePacket({
      execution: execution([
        task({
          id: 'validate',
          kind: 'validation',
          state: 'failed',
          objective: 'Run npm test',
          attempts: 3,
          diagnostics: ['1 test failed'],
        }),
      ]),
      generatedAt: COMPLETED_AT,
    })

    expect(packet.status).toBe('failed')
    expect(packet.validation).toEqual({
      passed: false,
      completedPhases: [],
      failedPhases: ['Run npm test'],
    })
    expect(packet.diagnostics).toEqual([{ taskId: 'validate', messages: ['1 test failed'] }])
    expect(packet.pullRequest.body).toContain('validate: 1 test failed')
  })

  it('persists packets atomically under the SymbolWright acceptance directory', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'symbolwright-acceptance-'))
    const packet = createMissionAcceptancePacket({
      execution: execution([task({ id: 'complete' })]),
      generatedAt: COMPLETED_AT,
    })
    const destination = await new MissionAcceptancePacketStore(workspaceRoot).save(packet)
    const stored = JSON.parse(await readFile(destination, 'utf8')) as { missionId: string }

    expect(destination).toContain(path.join('.symbolwright', 'autonomy', 'acceptance'))
    expect(stored.missionId).toBe('mission-42')
  })

  it('rejects unsafe mission IDs when saving', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'symbolwright-acceptance-'))
    const packet = {
      ...createMissionAcceptancePacket({
        execution: execution([task({ id: 'complete' })]),
        generatedAt: COMPLETED_AT,
      }),
      missionId: '../escape',
    }

    await expect(new MissionAcceptancePacketStore(workspaceRoot).save(packet)).rejects.toThrow(
      'Invalid mission ID',
    )
  })
})
