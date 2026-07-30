import { createHash } from 'node:crypto'

import type { MissionService } from '../mission/mission-service.js'
import type { GovernedDependencyAcquisitionResult } from './governed-dependency-acquisition.js'

export function recordDependencyAcquisitionMissionEvidence(
  missionService: MissionService,
  missionId: string,
  result: GovernedDependencyAcquisitionResult,
): void {
  const report = result.session.report
  const eventType =
    report.status === 'completed'
      ? 'sandbox.dependency.completed'
      : report.status === 'blocked'
        ? 'sandbox.dependency.blocked'
        : report.status === 'cancelled'
          ? 'sandbox.dependency.cancelled'
          : 'sandbox.dependency.failed'
  missionService.appendEvent(
    missionId,
    eventType,
    `npm dependency acquisition ${report.status}: ${report.packageCount} package(s).`,
    {
      acquisitionId: report.acquisitionId,
      ecosystem: report.ecosystem,
      status: report.status,
      decisionCode: report.decisionCode,
      reason: report.reason,
      packageCount: report.packageCount,
      cacheHits: report.cacheHits,
      networkRequests: report.networkRequests,
      archiveBytes: report.archiveBytes,
      expandedBytes: report.expandedBytes,
      fileCount: report.fileCount,
      evidenceSha256: report.evidenceSha256,
      ...(result.session.evidencePath === undefined
        ? {}
        : { evidencePathSha256: sha256(result.session.evidencePath) }),
      ...(report.policy === undefined ? {} : { dependencyPolicy: report.policy }),
      ...(result.layer === undefined
        ? {}
        : {
            dependencyLayer: {
              layerId: result.layer.layerId,
              packageCount: result.layer.packageCount,
              fileCount: result.layer.fileCount,
              totalBytes: result.layer.totalBytes,
              manifestSha256: result.layer.manifestSha256,
              packageLockSha256: result.layer.packageLockSha256,
            },
          }),
    },
  )
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}
