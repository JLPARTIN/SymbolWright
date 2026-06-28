import type { AjnaReviewSessionIdentity } from './ajna-review-session.js'
import type { AjnaProofBundleInput } from './ajna-proof-bundle.js'
import type { AjnaReviewPanelViewModel } from './ui/ajna-ui.types.js'
import type { AjnaGovernanceOverrideRecord } from './governance/ajna-overrides.js'
import { runAjnaReviewPipeline } from './ajna-review-pipeline.js'
import type { AjnaReviewPipelineReport } from './ajna-review-pipeline.js'
import type { AjnaRiskLevel } from './ajna-risk-synthesis.js'
import type { AjnaMergeDecisionState } from './ajna-merge-decision.js'
import type { CodemindChangedFileContext } from '../repo-context/repo-context.types.js'
import { buildAjnaFileInsights } from './analysis/ajna-file-insights.js'

export interface AjnaLiveReviewInput {
  readonly repository: string
  readonly headRef: string
  readonly baseRef: string
  readonly headSha: string
  readonly baseSha: string
  readonly pullRequestNumber?: number
  readonly changedFiles: readonly CodemindChangedFileContext[]
  readonly ciPassed?: boolean
  readonly testsPassed?: boolean
  readonly proofStatuses?: AjnaProofBundleInput
  readonly reviewPanel?: AjnaReviewPanelViewModel
  readonly governanceOverrides?: readonly AjnaGovernanceOverrideRecord[]
  readonly requiresOperatorApproval?: boolean
}

export interface AjnaLiveReviewResult {
  readonly riskLevel: AjnaRiskLevel
  readonly mergeDecision: AjnaMergeDecisionState
  readonly reportText: string
  readonly protectedFileCount: number
  readonly highRiskFiles: readonly string[]
  readonly findings: readonly string[]
  readonly pipelineReport: AjnaReviewPipelineReport
}

function deriveRepoImpactLevel(changedFiles: readonly CodemindChangedFileContext[]): string {
  const insights = buildAjnaFileInsights(changedFiles)
  const maxScore = insights.reduce((max, insight) => Math.max(max, insight.score), 0)

  if (maxScore >= 6) return 'CRITICAL'
  if (maxScore >= 4) return 'HIGH'
  if (maxScore >= 2) return 'MODERATE'
  return 'LOW'
}

function deriveProofStatuses(input: AjnaLiveReviewInput): AjnaProofBundleInput {
  if (input.proofStatuses !== undefined) {
    return input.proofStatuses
  }

  return {
    kernelTraceStatus: 'TRACE_PROOF_READY',
    ajnaMatrixStatus: 'AJNA_PROOF_READY',
    repoContextStatus: 'REPO_CONTEXT_PROOF_READY',
    governanceStatus: 'GOVERNANCE_PROOF_READY',
    runtimeBoundaryStatus: 'RUNTIME_BOUNDARY_PROOF_READY',
    githubAdapterStatus: 'GITHUB_ADAPTER_PROOF_READY',
  }
}

export function runAjnaLiveReview(input: AjnaLiveReviewInput): AjnaLiveReviewResult {
  const identity: AjnaReviewSessionIdentity = {
    repository: input.repository,
    pullRequestNumber: input.pullRequestNumber ?? 1,
    headSha: input.headSha,
    baseSha: input.baseSha,
  }

  const insights = buildAjnaFileInsights(input.changedFiles)
  const protectedFileCount = input.changedFiles.filter((f) => f.protectedPath).length
  const highRiskFiles = insights
    .filter((insight) => insight.severity === 'HIGH' || insight.severity === 'CRITICAL')
    .map((insight) => insight.path)

  const proofStatuses = deriveProofStatuses(input)
  const repoImpactLevel = deriveRepoImpactLevel(input.changedFiles)

  const findings: string[] = []

  if (input.ciPassed === false) {
    findings.push('CI checks are failing')
  }
  if (input.testsPassed === false) {
    findings.push('Tests are failing')
  }
  if (protectedFileCount > 0) {
    findings.push(`${protectedFileCount} protected file(s) modified`)
  }
  for (const file of highRiskFiles) {
    findings.push(`High-risk change: ${file}`)
  }

  const pipelineReport = runAjnaReviewPipeline({
    identity,
    proofStatuses,
    ...(input.reviewPanel !== undefined ? { reviewPanel: input.reviewPanel } : {}),
    ...(input.governanceOverrides !== undefined
      ? { governanceOverrides: input.governanceOverrides }
      : {}),
    repoImpactLevel,
    protectedFileCount,
    ...(input.requiresOperatorApproval !== undefined
      ? { requiresOperatorApproval: input.requiresOperatorApproval }
      : {}),
    ...(findings.length > 0 ? { blockingFindings: findings } : {}),
    reportFormat: 'markdown',
    renderedAt: new Date().toISOString(),
  })

  return {
    riskLevel: pipelineReport.riskSynthesis.riskLevel,
    mergeDecision: pipelineReport.mergeDecision.state,
    reportText: pipelineReport.reviewReport.text,
    protectedFileCount,
    highRiskFiles,
    findings,
    pipelineReport,
  }
}
