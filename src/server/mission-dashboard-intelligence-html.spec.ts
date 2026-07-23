import { describe, expect, it } from 'vitest'

import type { MissionDashboardProjection } from '../autonomy/mission-dashboard-projection.js'
import { renderMissionDashboardHtml } from './mission-dashboard-html.js'

function dashboard(): MissionDashboardProjection {
  return {
    missionId: 'mission-impact',
    objective: 'Change the core contract',
    status: 'completed',
    taskCounts: {
      queued: 0,
      blocked: 0,
      ready: 0,
      running: 0,
      validating: 0,
      repairing: 0,
      completed: 2,
      failed: 0,
      cancelled: 0,
      interrupted: 0,
    },
    tasks: [],
    repairAttemptCount: 0,
    modifiedFiles: ['src/core.ts'],
    impact: {
      changedFiles: ['src/core.ts'],
      directlyAffectedFiles: ['src/service.ts'],
      transitivelyAffectedFiles: ['src/<api>.ts'],
      affectedPackages: ['api', 'core'],
      affectedExportedSymbols: ['runCore'],
      validationCommands: ['npm test'],
      risk: 'medium',
      riskScore: 31,
      reasons: ['1 direct importer is affected.'],
    },
    mergeReadiness: {
      decision: 'review-required',
      score: 78,
      impactRisk: 'medium',
      passedValidations: ['npm test'],
      failedValidations: [],
      missingValidations: [],
      unresolvedDiagnostics: [],
      evidenceCount: 2,
      reasons: ['Review <exported> contract impact.'],
    },
    timeline: [],
    startedAt: '2026-07-23T00:00:00.000Z',
    updatedAt: '2026-07-23T00:01:00.000Z',
    completedAt: '2026-07-23T00:01:00.000Z',
    durationMs: 60_000,
  }
}

describe('mission dashboard repository intelligence', () => {
  it('renders explainable impact and merge readiness safely', () => {
    const html = renderMissionDashboardHtml(dashboard())

    expect(html).toContain('Repository intelligence')
    expect(html).toContain('data-readiness="review-required"')
    expect(html).toContain('data-impact-risk="medium"')
    expect(html).toContain('78/100')
    expect(html).toContain('src/service.ts')
    expect(html).toContain('src/&lt;api&gt;.ts')
    expect(html).toContain('Review &lt;exported&gt; contract impact.')
    expect(html).not.toContain('<exported>')
  })
})
