import { buildAjnaReviewSession } from './ajna-review-session.js';
import type { AjnaReviewSession, AjnaReviewSessionIdentity } from './ajna-review-session.js';
import { buildAjnaProofBundle } from './ajna-proof-bundle.js';
import type { AjnaProofBundle, AjnaProofBundleInput } from './ajna-proof-bundle.js';
import { synthesizeAjnaRisk } from './ajna-risk-synthesis.js';
import type { AjnaRiskSynthesis } from './ajna-risk-synthesis.js';
import { buildAjnaMergeDecision } from './ajna-merge-decision.js';
import type { AjnaMergeDecision } from './ajna-merge-decision.js';
import { composeAjnaReviewReport } from './ajna-review-report-composer.js';
import type { AjnaReviewReport } from './ajna-review-report-composer.js';

export type {
  AjnaReviewSession,
  AjnaProofBundle,
  AjnaRiskSynthesis,
  AjnaMergeDecision,
  AjnaReviewReport,
};

export const AJNA_REVIEW_PIPELINE_BLOCK_ID =
  'CODEMIND-AJNA-REVIEW-06' as const;
export const AJNA_REVIEW_PIPELINE_PR_ID = 'PR-CM-AJNA-06' as const;
export const AJNA_REVIEW_PIPELINE_PHASE_ID = 'CODEMIND-AJNA-06' as const;

export interface AjnaRuntimeBoundarySnapshot {
  readonly providerInvocationAllowed: false;
  readonly repoMutationAllowed: false;
  readonly githubWriteAllowed: false;
  readonly commandExecutionAllowed: false;
}

export interface AjnaReviewPipelineInput {
  readonly identity: AjnaReviewSessionIdentity;
  readonly proofStatuses: AjnaProofBundleInput;
  readonly repoImpactLevel?: string;
  readonly protectedFileCount?: number;
  readonly requiresOperatorApproval?: boolean;
  readonly blockingFindings?: readonly string[];
  /** ISO timestamp — omit for deterministic output. */
  readonly renderedAt?: string;
}

export interface AjnaReviewPipelineReport {
  readonly blockId: typeof AJNA_REVIEW_PIPELINE_BLOCK_ID;
  readonly prId: typeof AJNA_REVIEW_PIPELINE_PR_ID;
  readonly phaseId: typeof AJNA_REVIEW_PIPELINE_PHASE_ID;
  readonly session: AjnaReviewSession;
  readonly proofBundle: AjnaProofBundle;
  readonly riskSynthesis: AjnaRiskSynthesis;
  readonly mergeDecision: AjnaMergeDecision;
  readonly reviewReport: AjnaReviewReport;
  readonly runtimeBoundary: AjnaRuntimeBoundarySnapshot;
}

export function runAjnaReviewPipeline(
  input: AjnaReviewPipelineInput,
): AjnaReviewPipelineReport {
  const session = buildAjnaReviewSession({
    identity: input.identity,
    ...(input.renderedAt !== undefined ? { createdAtIso: input.renderedAt } : {}),
  });

  const proofBundle = buildAjnaProofBundle(input.proofStatuses);

  const riskInput: Parameters<typeof synthesizeAjnaRisk>[0] = {
    proofBundle,
    ...(input.blockingFindings !== undefined
      ? { blockingFindings: input.blockingFindings }
      : {}),
    ...(input.repoImpactLevel !== undefined
      ? { repoImpactLevel: input.repoImpactLevel }
      : {}),
    ...(input.protectedFileCount !== undefined
      ? { protectedFileCount: input.protectedFileCount }
      : {}),
  };
  const riskSynthesis = synthesizeAjnaRisk(riskInput);

  const decisionInput: Parameters<typeof buildAjnaMergeDecision>[0] = {
    proofBundle,
    riskSynthesis,
    ...(input.requiresOperatorApproval !== undefined
      ? { requiresOperatorApproval: input.requiresOperatorApproval }
      : {}),
  };
  const mergeDecision = buildAjnaMergeDecision(decisionInput);

  const reportInput: Parameters<typeof composeAjnaReviewReport>[0] = {
    session,
    proofBundle,
    riskSynthesis,
    mergeDecision,
    format: 'plain',
    ...(input.renderedAt !== undefined ? { renderedAt: input.renderedAt } : {}),
  };
  const reviewReport = composeAjnaReviewReport(reportInput);

  return {
    blockId: AJNA_REVIEW_PIPELINE_BLOCK_ID,
    prId: AJNA_REVIEW_PIPELINE_PR_ID,
    phaseId: AJNA_REVIEW_PIPELINE_PHASE_ID,
    session,
    proofBundle,
    riskSynthesis,
    mergeDecision,
    reviewReport,
    runtimeBoundary: {
      providerInvocationAllowed: false,
      repoMutationAllowed: false,
      githubWriteAllowed: false,
      commandExecutionAllowed: false,
    },
  };
}
