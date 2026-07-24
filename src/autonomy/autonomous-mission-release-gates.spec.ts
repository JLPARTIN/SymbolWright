import { describe, expect, it, vi } from 'vitest'

import type { MissionAcceptancePacket } from './mission-acceptance-packet.js'
import { AutonomousMissionReleaseService } from './autonomous-mission-release.js'
import type { PersistedMissionExecution } from './persistent-mission-executor.js'

const MISSION_ID = 'mission-release-gates'

function packet(
  input: {
    validationPassed?: boolean
    decision?: 'ready' | 'review-required' | 'blocked'
    intelligence?: boolean
  } = {},
): MissionAcceptancePacket {
  const withIntelligence = input.intelligence ?? true
  return {
    schemaVersion: 1,
    missionId: MISSION_ID,
    objective: 'Harden release gates',
    status: 'accepted',
    generatedAt: '2026-07-23T23:00:00.000Z',
    startedAt: '2026-07-23T22:00:00.000Z',
    completedAt: '2026-07-23T22:30:00.000Z',
    durationMs: 1_800_000,
    modifiedFiles: ['src/release.ts'],
    taskSummary: {
      total: 2,
      completed: 2,
      failed: 0,
      blocked: 0,
      cancelled: 0,
      unfinished: 0,
      attempts: 2,
    },
    validation: {
      passed: input.validationPassed ?? true,
      completedPhases: ['Run npm test'],
      failedPhases: [],
    },
    intelligence: withIntelligence
      ? {
          impact: {
            changedFiles: ['src/release.ts'],
            directlyAffectedFiles: [],
            transitivelyAffectedFiles: [],
            affectedPackages: ['codemind'],
            affectedExportedSymbols: [],
            validationCommands: ['npm test'],
            risk: 'low',
            riskScore: 10,
            reasons: [],
          },
          mergeReadiness: {
            decision: input.decision ?? 'ready',
            score: 90,
            impactRisk: 'low',
            passedValidations: ['npm test'],
            failedValidations: [],
            missingValidations: [],
            unresolvedDiagnostics: [],
            evidenceCount: 2,
            reasons: [],
          },
        }
      : null,
    evidence: [{ taskId: 'validate', taskObjective: 'Run npm test', kind: 'validation', id: 'v1' }],
    diagnostics: [],
    artifacts: [],
    pullRequest: { title: 'feat(agent): complete mission', body: 'body' },
  }
}

function completedExecution(): PersistedMissionExecution {
  return {
    schemaVersion: 1,
    graph: {
      schemaVersion: 1,
      missionId: MISSION_ID,
      objective: 'Harden release gates',
      createdAt: '2026-07-23T22:00:00.000Z',
      updatedAt: '2026-07-23T22:30:00.000Z',
      tasks: [],
    },
    modifiedFiles: ['src/release.ts'],
    startedAt: '2026-07-23T22:00:00.000Z',
    updatedAt: '2026-07-23T22:30:00.000Z',
    completedAt: '2026-07-23T22:30:00.000Z',
  }
}

function service(acceptance: MissionAcceptancePacket, previous?: PersistedMissionExecution) {
  const coordinator = {
    start: vi.fn(),
    resume: vi.fn(),
    status: vi.fn(async () => ({ missionId: MISSION_ID, status: 'completed' })),
    specialists: vi.fn(async () => undefined),
  }
  const save = vi.fn(async () => undefined)
  const appendEvent = vi.fn()
  const release = new AutonomousMissionReleaseService({
    workspaceRoot: '/tmp/codemind-release-gates',
    missionService: {
      get: vi.fn(() => ({
        id: MISSION_ID,
        objective: 'Harden release gates',
        repository: { rootPath: '/repo' },
      })) as never,
      appendEvent,
    },
    coordinator: coordinator as never,
    executionStore: {
      load: vi.fn(async () => previous),
      save: vi.fn(async () => undefined),
    },
    validationCommands: ['npm test'],
    store: { load: vi.fn(), save },
    generateAcceptance: vi.fn(async () => ({ packet: acceptance, path: '/packet.json' })),
  })
  return { release, coordinator, save, appendEvent }
}

describe('autonomous mission release gates', () => {
  it('preserves a blocked merge-readiness decision as a blocked release', async () => {
    const fixture = service(packet({ decision: 'blocked' }))
    fixture.coordinator.start.mockResolvedValue({ dashboard: { status: 'completed' } })

    const result = await fixture.release.execute(MISSION_ID)

    expect(result.state).toBe('blocked')
    expect(result.nextAction).toBe('resolve-blocker')
  })

  it('requires review when repository intelligence is unavailable', async () => {
    const fixture = service(packet({ intelligence: false }))
    fixture.coordinator.start.mockResolvedValue({ dashboard: { status: 'completed' } })

    const result = await fixture.release.execute(MISSION_ID)

    expect(result.state).toBe('review-required')
    expect(result.nextAction).toBe('review')
  })

  it('blocks a release when no complete validation chain exists', async () => {
    const fixture = service(packet({ validationPassed: false }))
    fixture.coordinator.start.mockResolvedValue({ dashboard: { status: 'completed' } })

    const result = await fixture.release.execute(MISSION_ID)

    expect(result.state).toBe('blocked')
  })

  it('projects completed execution without replaying coordinator resume events', async () => {
    const fixture = service(packet(), completedExecution())

    const result = await fixture.release.execute(MISSION_ID)

    expect(result.executionMode).toBe('existing')
    expect(fixture.coordinator.status).toHaveBeenCalledWith(MISSION_ID)
    expect(fixture.coordinator.start).not.toHaveBeenCalled()
    expect(fixture.coordinator.resume).not.toHaveBeenCalled()
  })
})
