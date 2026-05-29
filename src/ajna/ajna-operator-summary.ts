import type { AjnaReviewPipelineReport } from './ajna-review-pipeline.js';

export const AJNA_OPERATOR_SUMMARY_BLOCK_ID =
  'CODEMIND-AJNA-REVIEW-07' as const;
export const AJNA_OPERATOR_SUMMARY_PR_ID = 'PR-CM-AJNA-07' as const;
export const AJNA_OPERATOR_SUMMARY_PHASE_ID = 'CODEMIND-AJNA-07' as const;

export const AJNA_OPERATOR_ACTIONS = [
  'MERGE_ALLOWED',
  'REVIEW_REQUIRED',
  'FIX_REQUIRED',
  'PROOF_MISSING',
  'BLOCKED_BY_GOVERNANCE',
  'BLOCKED_BY_RUNTIME_BOUNDARY',
] as const;
export type AjnaOperatorAction = (typeof AJNA_OPERATOR_ACTIONS)[number];

export interface AjnaOperatorSummary {
  readonly blockId: typeof AJNA_OPERATOR_SUMMARY_BLOCK_ID;
  readonly prId: typeof AJNA_OPERATOR_SUMMARY_PR_ID;
  readonly phaseId: typeof AJNA_OPERATOR_SUMMARY_PHASE_ID;
  readonly status: string;
  readonly risk: string;
  readonly mergeReadiness: string;
  readonly topBlockingReason: string;
  readonly proofScore: string;
  readonly operatorAction: AjnaOperatorAction;
  readonly mutationAllowed: false;
  readonly githubWriteAllowed: false;
  readonly providerInvocationAllowed: false;
}

function selectOperatorAction(
  report: AjnaReviewPipelineReport,
): AjnaOperatorAction {
  const { mergeDecision, proofBundle, riskSynthesis } = report;

  if (proofBundle.invalidProofDomains.includes('runtimeBoundary')) {
    return 'BLOCKED_BY_RUNTIME_BOUNDARY';
  }
  if (
    proofBundle.invalidProofDomains.includes('governance') ||
    proofBundle.blockingProofDomains.includes('governance')
  ) {
    return 'BLOCKED_BY_GOVERNANCE';
  }
  if (proofBundle.missingProofDomains.length > 0) {
    return 'PROOF_MISSING';
  }
  if (mergeDecision.state === 'MERGE_READY') {
    return 'MERGE_ALLOWED';
  }
  if (mergeDecision.state === 'NEEDS_OPERATOR_REVIEW') {
    return 'REVIEW_REQUIRED';
  }
  if (
    riskSynthesis.riskLevel === 'BLOCKED' ||
    riskSynthesis.riskLevel === 'CRITICAL' ||
    mergeDecision.state === 'BLOCKED'
  ) {
    return 'FIX_REQUIRED';
  }
  return 'REVIEW_REQUIRED';
}

function computeProofScore(proofBundle: AjnaReviewPipelineReport['proofBundle']): string {
  const total = 6;
  const missing = proofBundle.missingProofDomains.length;
  const blocked = proofBundle.blockingProofDomains.length;
  const invalid = proofBundle.invalidProofDomains.length;
  const notReady = missing + blocked + invalid;
  const ready = Math.max(0, total - notReady);
  return `${ready}/${total}`;
}

function topBlockingReason(report: AjnaReviewPipelineReport): string {
  const { proofBundle, riskSynthesis, mergeDecision } = report;

  if (proofBundle.blockingProofDomains.length > 0) {
    return `Proof domain blocked: ${proofBundle.blockingProofDomains[0]}`;
  }
  if (proofBundle.invalidProofDomains.length > 0) {
    return `Proof domain invalid: ${proofBundle.invalidProofDomains[0]}`;
  }
  if (proofBundle.missingProofDomains.length > 0) {
    return `Proof domain missing: ${proofBundle.missingProofDomains[0]}`;
  }
  if (mergeDecision.reasons.length > 0) {
    return mergeDecision.reasons[0] ?? '';
  }
  return riskSynthesis.explanation[0] ?? '';
}

export function buildAjnaOperatorSummary(
  report: AjnaReviewPipelineReport,
): AjnaOperatorSummary {
  return {
    blockId: AJNA_OPERATOR_SUMMARY_BLOCK_ID,
    prId: AJNA_OPERATOR_SUMMARY_PR_ID,
    phaseId: AJNA_OPERATOR_SUMMARY_PHASE_ID,
    status: report.mergeDecision.state,
    risk: report.riskSynthesis.riskLevel,
    mergeReadiness: report.proofBundle.proofGateStatus,
    topBlockingReason: topBlockingReason(report),
    proofScore: computeProofScore(report.proofBundle),
    operatorAction: selectOperatorAction(report),
    mutationAllowed: false,
    githubWriteAllowed: false,
    providerInvocationAllowed: false,
  };
}
