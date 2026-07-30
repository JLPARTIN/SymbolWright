import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import type { MissionService } from '../mission/mission-service.js'
import type {
  DependencyAcquisitionReport,
  DependencyAcquisitionSession,
  DependencyAcquisitionStatus,
} from './dependency-acquisition-service.js'
import { recordDependencyAcquisitionMissionEvidence } from './dependency-mission-evidence.js'
import type { GovernedDependencyAcquisitionResult } from './governed-dependency-acquisition.js'
import type { StrongSandboxDependencyLayer } from './npm-dependency-layer.js'

const eventTypes: ReadonlyArray<readonly [DependencyAcquisitionStatus, string]> = [
  ['completed', 'sandbox.dependency.completed'],
  ['blocked', 'sandbox.dependency.blocked'],
  ['cancelled', 'sandbox.dependency.cancelled'],
  ['failed', 'sandbox.dependency.failed'],
]

describe('recordDependencyAcquisitionMissionEvidence', () => {
  it.each(eventTypes)('maps %s reports to %s mission events', (status, eventType) => {
    const appendEvent = vi.fn()

    recordDependencyAcquisitionMissionEvidence(
      { appendEvent } as unknown as MissionService,
      'mission-1',
      result(status),
    )

    expect(appendEvent).toHaveBeenCalledWith(
      'mission-1',
      eventType,
      `npm dependency acquisition ${status}: 2 package(s).`,
      expect.objectContaining({
        acquisitionId: 'dependency-test',
        ecosystem: 'npm',
        status,
        packageCount: 2,
      }),
    )
  })

  it('records hashed evidence paths, policy identity, and immutable layer metadata', () => {
    const appendEvent = vi.fn()
    const evidencePath = '/private/workspace/.symbolwright/dependency-evidence.json'

    recordDependencyAcquisitionMissionEvidence(
      { appendEvent } as unknown as MissionService,
      'mission-2',
      result('completed', { includeEvidencePath: true, includePolicy: true, includeLayer: true }),
    )

    expect(appendEvent).toHaveBeenCalledWith(
      'mission-2',
      'sandbox.dependency.completed',
      'npm dependency acquisition completed: 2 package(s).',
      expect.objectContaining({
        evidencePathSha256: createHash('sha256').update(evidencePath, 'utf8').digest('hex'),
        dependencyPolicy: {
          id: 'npm-controlled',
          version: 3,
          fingerprint: 'policy-fingerprint',
        },
        dependencyLayer: {
          layerId: 'layer-1',
          packageCount: 2,
          fileCount: 4,
          totalBytes: 128,
          manifestSha256: 'd'.repeat(64),
          packageLockSha256: 'c'.repeat(64),
        },
      }),
    )
  })
})

function result(
  status: DependencyAcquisitionStatus,
  options: {
    readonly includeEvidencePath?: boolean
    readonly includePolicy?: boolean
    readonly includeLayer?: boolean
  } = {},
): GovernedDependencyAcquisitionResult {
  const report: DependencyAcquisitionReport = {
    schemaVersion: 1,
    acquisitionId: 'dependency-test',
    status,
    ecosystem: 'npm',
    startedAt: '2026-07-30T00:00:00.000Z',
    completedAt: '2026-07-30T00:00:01.000Z',
    durationMs: 1_000,
    decisionCode: status === 'completed' ? 'DEPENDENCY_ACQUISITION_COMPLETED' : 'TEST_DECISION',
    reason: 'test report',
    ...(options.includePolicy
      ? {
          policy: {
            id: 'npm-controlled',
            version: 3,
            fingerprint: 'policy-fingerprint',
          },
        }
      : {}),
    packageJsonSha256: 'b'.repeat(64),
    packageLockSha256: 'c'.repeat(64),
    packageCount: 2,
    cacheHits: 1,
    networkRequests: 1,
    archiveBytes: 64,
    expandedBytes: 128,
    fileCount: 4,
    artifacts: [],
    evidenceSha256: 'e'.repeat(64),
  }
  const session: DependencyAcquisitionSession = {
    report,
    acquiredArtifacts: [],
    ...(options.includeEvidencePath
      ? { evidencePath: '/private/workspace/.symbolwright/dependency-evidence.json' }
      : {}),
  }
  return {
    session,
    ...(options.includeLayer ? { layer: dependencyLayer() } : {}),
  }
}

function dependencyLayer(): StrongSandboxDependencyLayer {
  return {
    schemaVersion: 1,
    layerId: 'layer-1',
    ecosystem: 'npm',
    rootPath: '/state/layer-1',
    nodeModulesPath: '/state/layer-1/node_modules',
    manifestPath: '/state/layer-1/manifest.json',
    sbomPath: '/state/layer-1/sbom.json',
    policyId: 'npm-controlled',
    policyVersion: 3,
    policyFingerprint: 'policy-fingerprint',
    packageJsonSha256: 'b'.repeat(64),
    packageLockSha256: 'c'.repeat(64),
    packageCount: 2,
    fileCount: 4,
    totalBytes: 128,
    manifestSha256: 'd'.repeat(64),
  }
}
