import { describe, expect, it } from 'vitest'

import { assessMergeReadiness } from './merge-readiness-assessment.js'
import type { RepositoryImpactAnalysis } from './repository-impact-analysis.js'

function impact(risk: RepositoryImpactAnalysis['risk'] = 'low'): RepositoryImpactAnalysis {
  return {
    changedFiles: ['src/core.ts'],
    directlyAffectedFiles: [],
    transitivelyAffectedFiles: [],
    affectedPackages: ['core'],
    affectedExportedSymbols: [],
    validationCommands: ['npm run typecheck', 'npm test'],
    risk,
    riskScore: risk === 'critical' ? 80 : risk === 'high' ? 55 : risk === 'medium' ? 30 : 5,
    reasons: [],
  }
}

describe('assessMergeReadiness', () => {
  it('marks fully validated evidence-backed work ready', () => {
    const result = assessMergeReadiness({
      impact: impact(),
      validations: [
        { command: 'npm run typecheck', passed: true },
        { command: 'npm test', passed: true },
      ],
      evidenceCount: 4,
    })

    expect(result.decision).toBe('ready')
    expect(result.score).toBe(100)
    expect(result.reasons).toEqual(['Required validation and evidence gates are satisfied.'])
  })

  it('blocks failed validation', () => {
    const result = assessMergeReadiness({
      impact: impact(),
      validations: [
        { command: 'npm run typecheck', passed: true },
        { command: 'npm test', passed: false },
      ],
      evidenceCount: 2,
    })

    expect(result.decision).toBe('blocked')
    expect(result.failedValidations).toEqual(['npm test'])
    expect(result.score).toBe(70)
  })

  it('blocks unresolved diagnostics even when validation passes', () => {
    const result = assessMergeReadiness({
      impact: impact(),
      validations: [
        { command: 'npm run typecheck', passed: true },
        { command: 'npm test', passed: true },
      ],
      unresolvedDiagnostics: ['stale generated client', 'stale generated client'],
      evidenceCount: 1,
    })

    expect(result.decision).toBe('blocked')
    expect(result.unresolvedDiagnostics).toEqual(['stale generated client'])
    expect(result.score).toBe(95)
  })

  it('requires review when required validation has not run', () => {
    const result = assessMergeReadiness({
      impact: impact('medium'),
      validations: [{ command: 'npm run typecheck', passed: true }],
      evidenceCount: 2,
    })

    expect(result.decision).toBe('review-required')
    expect(result.missingValidations).toEqual(['npm test'])
    expect(result.score).toBe(80)
  })

  it('requires review for critical impact even with green validation', () => {
    const result = assessMergeReadiness({
      impact: impact('critical'),
      validations: [
        { command: 'npm run typecheck', passed: true },
        { command: 'npm test', passed: true },
      ],
      evidenceCount: 6,
    })

    expect(result.decision).toBe('review-required')
    expect(result.score).toBe(70)
    expect(result.reasons).toContain('Repository impact risk is critical.')
  })

  it('penalizes missing evidence', () => {
    const result = assessMergeReadiness({
      impact: impact(),
      validations: [
        { command: 'npm run typecheck', passed: true },
        { command: 'npm test', passed: true },
      ],
      evidenceCount: 0,
    })

    expect(result.decision).toBe('ready')
    expect(result.score).toBe(80)
    expect(result.reasons).toContain('No execution evidence is attached.')
  })
})
