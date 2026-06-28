import { describe, expect, it } from 'vitest'

import type { CodemindChangedFileContext } from '../repo-context/repo-context.types.js'
import { runAjnaLiveReview } from './ajna-live-review.js'

function makeChangedFile(
  overrides: Partial<CodemindChangedFileContext> = {},
): CodemindChangedFileContext {
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

describe('runAjnaLiveReview', () => {
  it('returns LOW risk for simple low-impact changes', () => {
    const result = runAjnaLiveReview({
      repository: 'owner/repo',
      headRef: 'feature-branch',
      baseRef: 'main',
      headSha: 'abc123def456',
      baseSha: 'def456abc123',
      changedFiles: [makeChangedFile()],
    })

    expect(result.riskLevel).toBe('LOW')
    expect(result.mergeDecision).toBe('MERGE_READY')
    expect(result.protectedFileCount).toBe(0)
    expect(result.highRiskFiles).toHaveLength(0)
    expect(result.reportText).toContain('Ajna Review')
  })

  it('detects protected file changes as HIGH risk', () => {
    const result = runAjnaLiveReview({
      repository: 'owner/repo',
      headRef: 'feature-branch',
      baseRef: 'main',
      headSha: 'abc123def456',
      baseSha: 'def456abc123',
      changedFiles: [
        makeChangedFile({ path: 'package.json', protectedPath: true, impactLevel: 'HIGH' }),
      ],
    })

    expect(result.protectedFileCount).toBe(1)
    expect(result.findings).toContain('1 protected file(s) modified')
  })

  it('reports high-risk files from file insights', () => {
    const result = runAjnaLiveReview({
      repository: 'owner/repo',
      headRef: 'feature-branch',
      baseRef: 'main',
      headSha: 'abc123def456',
      baseSha: 'def456abc123',
      changedFiles: [
        makeChangedFile({
          path: 'src/auth/auth-handler.ts',
          impactLevel: 'CRITICAL',
          additions: 600,
          deletions: 200,
          protectedPath: true,
        }),
      ],
    })

    expect(result.highRiskFiles).toContain('src/auth/auth-handler.ts')
  })

  it('includes CI failure in findings', () => {
    const result = runAjnaLiveReview({
      repository: 'owner/repo',
      headRef: 'feature-branch',
      baseRef: 'main',
      headSha: 'abc123def456',
      baseSha: 'def456abc123',
      changedFiles: [makeChangedFile()],
      ciPassed: false,
    })

    expect(result.findings).toContain('CI checks are failing')
  })

  it('includes test failure in findings', () => {
    const result = runAjnaLiveReview({
      repository: 'owner/repo',
      headRef: 'feature-branch',
      baseRef: 'main',
      headSha: 'abc123def456',
      baseSha: 'def456abc123',
      changedFiles: [makeChangedFile()],
      testsPassed: false,
    })

    expect(result.findings).toContain('Tests are failing')
  })

  it('uses custom proof statuses when provided', () => {
    const result = runAjnaLiveReview({
      repository: 'owner/repo',
      headRef: 'feature-branch',
      baseRef: 'main',
      headSha: 'abc123def456',
      baseSha: 'def456abc123',
      changedFiles: [makeChangedFile()],
      proofStatuses: {
        kernelTraceStatus: 'TRACE_PROOF_READY',
        ajnaMatrixStatus: 'AJNA_PROOF_READY',
        repoContextStatus: 'REPO_CONTEXT_PROOF_READY',
        governanceStatus: 'GOVERNANCE_PROOF_READY',
        runtimeBoundaryStatus: 'RUNTIME_BOUNDARY_PROOF_READY',
        githubAdapterStatus: 'GITHUB_ADAPTER_PROOF_READY',
      },
    })

    expect(result.pipelineReport.proofBundle.allProofReady).toBe(true)
  })

  it('generates markdown format report', () => {
    const result = runAjnaLiveReview({
      repository: 'owner/repo',
      headRef: 'feature-branch',
      baseRef: 'main',
      headSha: 'abc123def456',
      baseSha: 'def456abc123',
      changedFiles: [makeChangedFile()],
    })

    expect(result.reportText).toContain('##')
  })

  it('handles empty changed files list', () => {
    const result = runAjnaLiveReview({
      repository: 'owner/repo',
      headRef: 'feature-branch',
      baseRef: 'main',
      headSha: 'abc123def456',
      baseSha: 'def456abc123',
      changedFiles: [],
    })

    expect(result.riskLevel).toBe('LOW')
    expect(result.protectedFileCount).toBe(0)
    expect(result.highRiskFiles).toHaveLength(0)
  })

  it('includes pullRequestNumber in identity when provided', () => {
    const result = runAjnaLiveReview({
      repository: 'owner/repo',
      headRef: 'feature-branch',
      baseRef: 'main',
      headSha: 'abc123def456',
      baseSha: 'def456abc123',
      pullRequestNumber: 42,
      changedFiles: [makeChangedFile()],
    })

    expect(result.pipelineReport.session.identity.pullRequestNumber).toBe(42)
  })
})
