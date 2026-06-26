import { describe, expect, it } from 'vitest'

import type { CodemindChangedFileContext } from '../repo-context/repo-context.types.js'
import { evaluateAjnaMergeGate } from './ajna-merge-gate.js'

function makeFile(overrides: Partial<CodemindChangedFileContext> = {}): CodemindChangedFileContext {
  return {
    path: 'src/example.ts',
    changeType: 'MODIFIED',
    additions: 10,
    deletions: 5,
    impactLevel: 'LOW',
    protectedPath: false,
    notes: [],
    ...overrides,
  }
}

const BASE_INPUT = {
  repository: 'owner/repo',
  headRef: 'feature-branch',
  baseRef: 'main',
  headSha: 'abc123def456',
  baseSha: 'def456abc123',
} as const

describe('evaluateAjnaMergeGate', () => {
  it('approves low-risk changes', () => {
    const result = evaluateAjnaMergeGate({
      ...BASE_INPUT,
      changedFiles: [makeFile()],
    })

    expect(result.verdict).toBe('APPROVED')
    expect(result.mergeDecision).toBe('MERGE_READY')
    expect(result.riskLevel).toBe('LOW')
  })

  it('blocks when CI is failing', () => {
    const result = evaluateAjnaMergeGate({
      ...BASE_INPUT,
      changedFiles: [makeFile()],
      ciPassed: false,
    })

    expect(result.reasons).toContain('CI checks are failing')
  })

  it('blocks when tests are failing', () => {
    const result = evaluateAjnaMergeGate({
      ...BASE_INPUT,
      changedFiles: [makeFile()],
      testsPassed: false,
    })

    expect(result.reasons).toContain('Tests are failing')
  })

  it('includes evidence summary with risk level and merge decision', () => {
    const result = evaluateAjnaMergeGate({
      ...BASE_INPUT,
      changedFiles: [makeFile()],
    })

    expect(result.evidenceSummary).toContain('Risk Level:')
    expect(result.evidenceSummary).toContain('Merge Decision:')
  })

  it('evidence summary includes protected file count when > 0', () => {
    const result = evaluateAjnaMergeGate({
      ...BASE_INPUT,
      changedFiles: [makeFile({ protectedPath: true, impactLevel: 'HIGH' })],
    })

    expect(result.evidenceSummary).toContain('Protected Files Modified:')
  })

  it('evidence summary includes high-risk files', () => {
    const result = evaluateAjnaMergeGate({
      ...BASE_INPUT,
      changedFiles: [
        makeFile({
          path: 'src/critical.ts',
          impactLevel: 'CRITICAL',
          additions: 600,
          deletions: 200,
          protectedPath: true,
        }),
      ],
    })

    expect(result.evidenceSummary).toContain('High-Risk Files:')
  })

  it('requires operator review for critical changes', () => {
    const result = evaluateAjnaMergeGate({
      ...BASE_INPUT,
      changedFiles: [
        makeFile({
          path: 'src/auth.ts',
          impactLevel: 'CRITICAL',
          additions: 800,
          deletions: 400,
          protectedPath: true,
        }),
      ],
    })

    expect(['NEEDS_OPERATOR_REVIEW', 'BLOCKED']).toContain(result.verdict)
  })

  it('respects requiresOperatorApproval flag', () => {
    const result = evaluateAjnaMergeGate({
      ...BASE_INPUT,
      changedFiles: [makeFile()],
      requiresOperatorApproval: true,
    })

    expect(result.verdict).toBe('NEEDS_OPERATOR_REVIEW')
  })

  it('returns review with full pipeline report', () => {
    const result = evaluateAjnaMergeGate({
      ...BASE_INPUT,
      changedFiles: [makeFile()],
    })

    expect(result.review).toBeDefined()
    expect(result.review.pipelineReport).toBeDefined()
    expect(result.review.pipelineReport.session).toBeDefined()
  })

  it('handles empty changed files gracefully', () => {
    const result = evaluateAjnaMergeGate({
      ...BASE_INPUT,
      changedFiles: [],
    })

    expect(result.verdict).toBe('APPROVED')
    expect(result.riskLevel).toBe('LOW')
  })
})
