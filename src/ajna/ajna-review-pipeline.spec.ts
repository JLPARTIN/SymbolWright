import { describe, expect, it } from 'vitest'

import {
  runAjnaReviewPipeline,
  AJNA_REVIEW_PIPELINE_BLOCK_ID,
  AJNA_REVIEW_PIPELINE_PHASE_ID,
  AJNA_REVIEW_PIPELINE_PR_ID,
} from './ajna-review-pipeline.js'
import { createAjnaGovernanceOverride } from './governance/ajna-overrides.js'
import type { AjnaReviewPanelViewModel } from './ui/ajna-ui.types.js'

const IDENTITY = {
  repository: 'JLPARTIN/JLPARTIN-SymbolWright',
  pullRequestNumber: 45,
  headSha: 'abc1234567890def',
  baseSha: 'def1234567890abc',
}

const ALL_READY_STATUSES = {
  kernelTraceStatus: 'TRACE_PROOF_READY',
  ajnaMatrixStatus: 'AJNA_PROOF_READY',
  repoContextStatus: 'REPO_CONTEXT_PROOF_READY',
  governanceStatus: 'GOVERNANCE_PROOF_READY',
  runtimeBoundaryStatus: 'RUNTIME_BOUNDARY_PROOF_READY',
  githubAdapterStatus: 'GITHUB_ADAPTER_PROOF_READY',
}

function makeReview(overrides: Partial<AjnaReviewPanelViewModel> = {}): AjnaReviewPanelViewModel {
  return {
    repository: 'JLPARTIN/SymbolWright',
    pullRequestNumber: 45,
    readiness: {
      ruling: 'READY_TO_REVIEW',
      confidence: 0.82,
      summary: 'Ready for governed review.',
      operatorDecisionRequired: false,
    },
    riskLanes: [],
    fileInsights: [
      {
        path: 'src/ajna/ajna-review-pipeline.ts',
        lane: 'unknown',
        additions: 42,
        deletions: 0,
        totalDelta: 42,
        score: 2,
        severity: 'LOW',
        flags: {
          largeDelta: false,
          protectedPath: false,
          configurationRisk: false,
          testOnlySignal: false,
        },
      },
    ],
    ciSummary: {
      total: 3,
      successful: 3,
      failed: 0,
      pending: 0,
      neutral: 0,
      healthy: true,
    },
    commentPreview: {
      enabled: false,
      markdown: 'dry-run only',
      dryRun: true,
    },
    ...overrides,
  }
}

describe('Ajna review pipeline governance integration', () => {
  it('emits canonical PR-CM-AJNA-09 metadata', () => {
    const report = runAjnaReviewPipeline({
      identity: IDENTITY,
      proofStatuses: ALL_READY_STATUSES,
      reviewPanel: makeReview(),
    })

    expect(report.blockId).toBe(AJNA_REVIEW_PIPELINE_BLOCK_ID)
    expect(report.prId).toBe(AJNA_REVIEW_PIPELINE_PR_ID)
    expect(report.phaseId).toBe(AJNA_REVIEW_PIPELINE_PHASE_ID)
  })

  it('keeps merge-ready path open when governance rules pass', () => {
    const report = runAjnaReviewPipeline({
      identity: IDENTITY,
      proofStatuses: ALL_READY_STATUSES,
      reviewPanel: makeReview(),
    })

    expect(report.governanceReport?.allPassed).toBe(true)
    expect(report.proofBundle.governanceStatus).toBe('GOVERNANCE_PROOF_READY')
    expect(report.mergeDecision.state).toBe('MERGE_READY')
    expect(report.reviewReport.text).toContain('Governance Rules')
  })

  it('blocks governance proof when an unoverridden rule fails', () => {
    const report = runAjnaReviewPipeline({
      identity: IDENTITY,
      proofStatuses: ALL_READY_STATUSES,
      reviewPanel: makeReview({
        ciSummary: {
          total: 3,
          successful: 2,
          failed: 1,
          pending: 0,
          neutral: 0,
          healthy: false,
        },
      }),
    })

    expect(report.governanceReport?.allPassed).toBe(false)
    expect(report.proofBundle.governanceStatus).toBe('GOVERNANCE_PROOF_BLOCKED')
    expect(report.proofBundle.blockingProofDomains).toContain('governance')
    expect(report.riskSynthesis.riskLevel).toBe('BLOCKED')
    expect(report.mergeDecision.state).toBe('BLOCKED')
    expect(report.reviewReport.text).toContain('ci.zero-failed-checks')
  })

  it('allows explicitly overridden governance failure to stay merge-ready', () => {
    const override = createAjnaGovernanceOverride({
      id: 'override-ci-1',
      createdAt: '2026-05-29T00:00:00.000Z',
      ruleId: 'ci.zero-failed-checks',
      justification: 'Operator confirmed flaky CI outside PR scope.',
      operatorId: 'JLPARTIN',
    })

    const report = runAjnaReviewPipeline({
      identity: IDENTITY,
      proofStatuses: ALL_READY_STATUSES,
      governanceOverrides: [override],
      reviewPanel: makeReview({
        ciSummary: {
          total: 3,
          successful: 2,
          failed: 1,
          pending: 0,
          neutral: 0,
          healthy: false,
        },
      }),
    })

    expect(report.governanceReport?.results[0]?.overridden).toBe(true)
    expect(report.proofBundle.governanceStatus).toBe('GOVERNANCE_PROOF_READY')
    expect(report.mergeDecision.state).toBe('MERGE_READY')
    expect(report.reviewReport.text).toContain('[OVERRIDDEN] ci.zero-failed-checks')
  })

  it('preserves runtime non-execution invariants', () => {
    const report = runAjnaReviewPipeline({
      identity: IDENTITY,
      proofStatuses: ALL_READY_STATUSES,
      reviewPanel: makeReview(),
    })

    expect(report.runtimeBoundary.providerInvocationAllowed).toBe(false)
    expect(report.runtimeBoundary.repoMutationAllowed).toBe(false)
    expect(report.runtimeBoundary.githubWriteAllowed).toBe(false)
    expect(report.runtimeBoundary.commandExecutionAllowed).toBe(false)
  })
})
