import { describe, expect, it } from 'vitest'

import type { CodemindChangedFileContext } from '../../repo-context/repo-context.types.js'
import { runAjnaPostEditHook } from './ajna-post-edit-hook.js'
import type { AjnaPostEditContext } from './ajna-post-edit-hook.js'

const DEFAULT_CONTEXT: AjnaPostEditContext = {
  repository: 'owner/repo',
  headRef: 'feature-branch',
  baseRef: 'main',
  headSha: 'abc123def456',
  baseSha: 'def456abc123',
}

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

describe('runAjnaPostEditHook', () => {
  it('returns not triggered for empty file list', () => {
    const result = runAjnaPostEditHook([], DEFAULT_CONTEXT)

    expect(result.triggered).toBe(false)
    expect(result.riskLevel).toBe('LOW')
    expect(result.warning).toBeUndefined()
    expect(result.review).toBeUndefined()
  })

  it('triggers for non-empty file list', () => {
    const result = runAjnaPostEditHook([makeFile()], DEFAULT_CONTEXT)

    expect(result.triggered).toBe(true)
    expect(result.review).toBeDefined()
  })

  it('returns no warning for LOW risk changes', () => {
    const result = runAjnaPostEditHook([makeFile()], DEFAULT_CONTEXT)

    expect(result.riskLevel).toBe('LOW')
    expect(result.warning).toBeUndefined()
  })

  it('returns warning for HIGH risk changes', () => {
    const result = runAjnaPostEditHook(
      [
        makeFile({
          path: 'src/auth.ts',
          impactLevel: 'CRITICAL',
          additions: 600,
          deletions: 200,
          protectedPath: true,
        }),
      ],
      DEFAULT_CONTEXT,
    )

    expect(result.warning).toBeDefined()
    expect(result.warning).toContain('risk')
  })

  it('warning includes findings when present', () => {
    const result = runAjnaPostEditHook(
      [
        makeFile({
          path: 'config/secrets.json',
          protectedPath: true,
          impactLevel: 'HIGH',
          additions: 300,
          deletions: 100,
        }),
      ],
      DEFAULT_CONTEXT,
    )

    if (result.warning !== undefined) {
      expect(result.warning).toContain('protected file')
    }
  })

  it('passes pullRequestNumber to review when provided', () => {
    const context: AjnaPostEditContext = {
      ...DEFAULT_CONTEXT,
      pullRequestNumber: 99,
    }

    const result = runAjnaPostEditHook([makeFile()], context)

    expect(result.review).toBeDefined()
    expect(result.review!.pipelineReport.session.identity.pullRequestNumber).toBe(99)
  })

  it('review includes risk level from Ajna pipeline', () => {
    const result = runAjnaPostEditHook(
      [makeFile({ additions: 5, deletions: 2 })],
      DEFAULT_CONTEXT,
    )

    expect(result.triggered).toBe(true)
    expect(['LOW', 'MODERATE', 'HIGH', 'CRITICAL', 'BLOCKED']).toContain(result.riskLevel)
  })
})
