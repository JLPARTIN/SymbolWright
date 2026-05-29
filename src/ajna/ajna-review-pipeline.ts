import { buildAjnaReviewSession } from './ajna-review-session.js';
import type { AjnaReviewSession, AjnaReviewSessionIdentity } from './ajna-review-session.js';
import { buildAjnaProofBundle } from './ajna-proof-bundle.js';
import type { AjnaProofBundle, AjnaProofBundleInput } from './ajna-proof-bundle.js';
import { synthesizeAjnaRisk } from './ajna-risk-synthesis.js';
import type { AjnaRiskSynthesis } from './ajna-risk-synthesis.js';
import { buildAjnaMergeDecision } from './ajna-merge-decision.js';
import type { AjnaMergeDecision } from './ajna-merge-decision.js';
import { composeAjnaReviewReport } from './ajna-review-report-composer.js';
import type { AjnaReviewReport, AjnaReviewReportFormat } from './ajna-review-report-composer.js';
import { evaluateAjnaGovernanceRules } from './governance/ajna-rule-engine.js';
import { renderAjnaGovernanceReport } from './governance/ajna-governance-renderer.js';
import type { AjnaRenderedGovernanceReport } from './governance/ajna-governance-renderer.js';
import type { AjnaGovernanceOverrideRecord } from './governance/ajna-overrides.js';
import type { AjnaReviewPanelViewModel } from './ui/ajna-ui.types.js';

export type {
  AjnaReviewSession,
  AjnaProofBundle,
  AjnaRiskSynthesis,
  AjnaMergeDecision,
  AjnaReviewReport,
};

export const AJNA_REVIEW_PIPELINE_BLOCK_ID =
  'CODEMIND-AJNA-REVIEW-09' as const;
export const AJNA_REVIEW_PIPELINE_PR_ID = 'PR-CM-AJNA-09' as const;
export const AJNA_REVIEW_PIPELINE_PHASE_ID = 'CODEMIND-AJNA-09' as const;

export interface AjnaRuntimeBoundarySnapshot {
  readonly providerInvocationAllowed: false;
  readonly repoMutationAllowed: false;
  readonly githubWriteAllowed: false;
  readonly commandExecutionAllowed: false;
}

export interface AjnaReviewPipelineInput {
  readonly identity: AjnaReviewSessionIdentity;
  readonly proofStatuses: AjnaProofBundleInput;
  readonly reviewPanel?: AjnaReviewPanelViewModel;
  readonly governanceOverrides?: readonly AjnaGovernanceOverrideRecord[];
  readonly repoImpactLevel?: string;
  readonly protectedFileCount?: number;
  readonly requiresOperatorApproval?: boolean;
  readonly blockingFindings?: readonly string[];
  readonly reportFormat?: AjnaReviewReportFormat;
  readonly renderedAt?: string;
}

export interface AjnaReviewPipelineReport {
  readonly blockId: typeof AJNA_REVIEW_PIPELINE_BLOCK_ID;
  readonly prId: typeof AJNA_REVIEW_PIPELINE_PR_ID;
  readonly phaseId: typeof AJNA_REVIEW_PIPELINE_PHASE_ID;
  readonly session: AjnaReviewSession;
  readonly proofBundle: AjnaProofBundle;
  readonly governanceReport?: AjnaRenderedGovernanceReport;
  readonly riskSynthesis: AjnaRiskSynthesis;
  readonly mergeDecision: AjnaMergeDecision;
  readonly reviewReport: AjnaReviewReport;
  readonly runtimeBoundary: AjnaRuntimeBoundarySnapshot;
}

function ruleFailuresWithoutOverride(
  governanceReport: AjnaRenderedGovernanceReport | undefined,
): readonly string[] {
  if (!governanceReport) {
    return [];
  }

  return governanceReport.results
    .filter((result) => !result.passed && !result.overridden)
    .map((result) => result.id);
}

function applyGovernanceResultToProofStatuses(
  proofStatuses: AjnaProofBundleInput,
  governanceReport: AjnaRenderedGovernanceReport | undefined,
): AjnaProofBundleInput {
  const blockingRules = ruleFailuresWithoutOverride(governanceReport);

  if (blockingRules.length === 0) {
    return proofStatuses;
  }

  return {
    ...proofStatuses,
    governanceStatus: 'GOVERNANCE_PROOF_BLOCKED',
  };
}

export function runAjnaReviewPipeline(
  input: AjnaReviewPipelineInput,
): AjnaReviewPipelineReport {
  const session = buildAjnaReviewSession({
    identity: input.identity,
    ...(input.renderedAt !== undefined ? { createdAtIso: input.renderedAt } : {}),
  });

  const governanceReport = input.reviewPanel
    ? renderAjnaGovernanceReport(
        evaluateAjnaGovernanceRules(input.reviewPanel),
        input.governanceOverrides ?? [],
      )
    : undefined;

  const effectiveProofStatuses = applyGovernanceResultToProofStatuses(
    input.proofStatuses,
    governanceReport,
  );
  const proofBundle = buildAjnaProofBundle(effectiveProofStatuses);
  const blockingRules = ruleFailuresWithoutOverride(governanceReport);

  const riskInput: Parameters<typeof synthesizeAjnaRisk>[0] = {
    proofBundle,
    ...(input.blockingFindings !== undefined || blockingRules.length > 0
      ? {
          blockingFindings: [
            ...(input.blockingFindings ?? []),
            ...blockingRules.map((ruleId) => `governance rule failed: ${ruleId}`),
          ],
        }
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

  const reviewReport = composeAjnaReviewReport({
    session,
    proofBundle,
    riskSynthesis,
    mergeDecision,
    governanceReport,
    format: input.reportFormat ?? 'plain',
    ...(input.renderedAt !== undefined ? { renderedAt: input.renderedAt } : {}),
  });

  return {
    blockId: AJNA_REVIEW_PIPELINE_BLOCK_ID,
    prId: AJNA_REVIEW_PIPELINE_PR_ID,
    phaseId: AJNA_REVIEW_PIPELINE_PHASE_ID,
    session,
    proofBundle,
    ...(governanceReport !== undefined ? { governanceReport } : {}),
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
