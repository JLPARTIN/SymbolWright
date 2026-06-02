import { describe, expect, it } from 'vitest'

import { buildAjnaFileInsights, computeAjnaFileRiskScore } from './ajna-file-insights.js'
import type { CodemindChangedFileContext } from '../../repo-context/repo-context.types.js'

function makeFile(overrides: Partial<CodemindChangedFileContext> = {}): CodemindChangedFileContext {
  return {
    path: 'src/ajna/analysis/ajna-file-insights.ts',
    changeType: 'MODIFIED',
    additions: 80,
    deletions: 10,
    impactLevel: 'MEDIUM',
    protectedPath: false,
    notes: [],
    ...overrides,
  }
}

describe('Ajna file insights', () => {
  it('computes higher scores for large protected configuration changes', () => {
    const score = computeAjnaFileRiskScore(
      makeFile({
        path: '.github/workflows/ci.yml',
        additions: 300,
        deletions: 40,
        impactLevel: 'HIGH',
        protectedPath: true,
      }),
    )

    expect(score).toBeGreaterThanOrEqual(8)
  })

  it('reduces score for test-only changes', () => {
    const score = computeAjnaFileRiskScore(
      makeFile({
        path: 'src/ajna/analysis/ajna-file-insights.spec.ts',
        additions: 80,
        deletions: 0,
        impactLevel: 'LOW',
      }),
    )

    expect(score).toBe(0)
  })

  it('builds file-level insights for heatmap rendering', () => {
    const insights = buildAjnaFileInsights([
      makeFile({
        path: '.github/workflows/ci.yml',
        additions: 300,
        deletions: 40,
        impactLevel: 'HIGH',
        protectedPath: true,
      }),
      makeFile({
        path: 'src/ajna/analysis/ajna-file-insights.spec.ts',
        additions: 80,
        deletions: 0,
        impactLevel: 'LOW',
      }),
    ])

    expect(insights).toHaveLength(2)
    expect(insights[0]?.path).toBe('.github/workflows/ci.yml')
    expect(insights[0]?.severity).toBe('CRITICAL')
    expect(insights[0]?.flags.protectedPath).toBe(true)
    expect(insights[1]?.flags.testOnlySignal).toBe(true)
  })
})
