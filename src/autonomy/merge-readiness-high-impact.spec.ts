import { describe, expect, it } from 'vitest'

import { assessMergeReadiness } from './merge-readiness-assessment.js'
import type { RepositoryImpactAnalysis } from './repository-impact-analysis.js'

const HIGH_IMPACT: RepositoryImpactAnalysis = {
  changedFiles: ['src/core.ts'],
  directlyAffectedFiles: ['src/service.ts'],
  transitivelyAffectedFiles: ['src/api.ts'],
  affectedPackages: ['api', 'core', 'services'],
  affectedExportedSymbols: ['runCore'],
  validationCommands: ['npm test'],
  risk: 'high',
  riskScore: 55,
  reasons: ['Repository contract impact is high.'],
}

describe('high-impact merge readiness policy', () => {
  it('requires review even when validation and evidence are complete', () => {
    const result = assessMergeReadiness({
      impact: HIGH_IMPACT,
      validations: [{ command: 'npm test', passed: true }],
      evidenceCount: 4,
    })

    expect(result.score).toBe(82)
    expect(result.decision).toBe('review-required')
    expect(result.reasons).toContain('Repository impact risk is high.')
  })
})
