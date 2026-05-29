import { runAjnaReviewPipeline } from '../ajna-review-pipeline.js';
import type { AjnaReviewPipelineReport } from '../ajna-review-pipeline.js';

export const AJNA_FIXTURE_BLOCK_ID = 'CODEMIND-AJNA-REVIEW-08' as const;
export const AJNA_FIXTURE_PR_ID = 'PR-CM-AJNA-08' as const;
export const AJNA_FIXTURE_PHASE_ID = 'CODEMIND-AJNA-08' as const;

const BASE_IDENTITY = {
  repository: 'JLPARTIN/JLPARTIN-CodeMind',
  headSha: 'fixture000000001',
  baseSha: 'fixture000000000',
};

const ALL_READY_STATUSES = {
  kernelTraceStatus: 'TRACE_PROOF_READY',
  ajnaMatrixStatus: 'AJNA_PROOF_READY',
  repoContextStatus: 'REPO_CONTEXT_PROOF_READY',
  governanceStatus: 'GOVERNANCE_PROOF_READY',
  runtimeBoundaryStatus: 'RUNTIME_BOUNDARY_PROOF_READY',
  githubAdapterStatus: 'GITHUB_ADAPTER_PROOF_READY',
} as const;

/** Fully merge-ready PR — all proof domains pass, LOW risk. */
export const FIXTURE_MERGE_READY: AjnaReviewPipelineReport =
  runAjnaReviewPipeline({
    identity: { ...BASE_IDENTITY, pullRequestNumber: 100 },
    proofStatuses: ALL_READY_STATUSES,
  });

/** PR with no proof evidence provided — all domains missing. */
export const FIXTURE_MISSING_PROOF: AjnaReviewPipelineReport =
  runAjnaReviewPipeline({
    identity: { ...BASE_IDENTITY, pullRequestNumber: 101 },
    proofStatuses: {},
  });

/** PR blocked by runtime boundary proof being invalid. */
export const FIXTURE_RUNTIME_BLOCKED: AjnaReviewPipelineReport =
  runAjnaReviewPipeline({
    identity: { ...BASE_IDENTITY, pullRequestNumber: 102 },
    proofStatuses: {
      ...ALL_READY_STATUSES,
      runtimeBoundaryStatus: 'RUNTIME_BOUNDARY_PROOF_INVALID',
    },
  });

/** PR blocked by governance proof being invalid. */
export const FIXTURE_GOVERNANCE_BLOCKED: AjnaReviewPipelineReport =
  runAjnaReviewPipeline({
    identity: { ...BASE_IDENTITY, pullRequestNumber: 103 },
    proofStatuses: {
      ...ALL_READY_STATUSES,
      governanceStatus: 'GOVERNANCE_PROOF_INVALID',
    },
  });

/** PR requiring operator review due to high-risk protected path changes. */
export const FIXTURE_HIGH_RISK_PROTECTED: AjnaReviewPipelineReport =
  runAjnaReviewPipeline({
    identity: { ...BASE_IDENTITY, pullRequestNumber: 104 },
    proofStatuses: ALL_READY_STATUSES,
    protectedFileCount: 4,
  });

/** PR blocked by GitHub adapter proof being invalid. */
export const FIXTURE_GITHUB_ADAPTER_INVALID: AjnaReviewPipelineReport =
  runAjnaReviewPipeline({
    identity: { ...BASE_IDENTITY, pullRequestNumber: 105 },
    proofStatuses: {
      ...ALL_READY_STATUSES,
      githubAdapterStatus: 'GITHUB_ADAPTER_PROOF_INVALID',
    },
  });

export const ALL_FIXTURES: readonly AjnaReviewPipelineReport[] = [
  FIXTURE_MERGE_READY,
  FIXTURE_MISSING_PROOF,
  FIXTURE_RUNTIME_BLOCKED,
  FIXTURE_GOVERNANCE_BLOCKED,
  FIXTURE_HIGH_RISK_PROTECTED,
  FIXTURE_GITHUB_ADAPTER_INVALID,
];
