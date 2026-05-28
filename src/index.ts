export {
  CODEMIND_AJNA_CAPABILITY_NAME,
  CODEMIND_PLATFORM_NAME,
  getCodemindFoundationSnapshot,
} from './codemind-foundation.js';
export type {
  CodemindFoundationSnapshot,
  CodemindRuntimePosture,
} from './codemind-foundation.js';

export {
  evaluateCodemindPermissionRequest,
  resolveHighestDisposition,
} from './permissions/codemind-permission-policy.js';
export {
  CODEMIND_MODES,
  CODEMIND_PERMISSION_DISPOSITIONS,
  CODEMIND_PROTECTED_PATH_CLASSES,
  CODEMIND_RISK_LEVELS,
  CODEMIND_TARGET_KINDS,
  CODEMIND_TOOL_CATEGORIES,
  CODEMIND_TRUST_ZONES,
} from './permissions/codemind-permission.types.js';
export type {
  CodemindMode,
  CodemindPermissionDecision,
  CodemindPermissionDisposition,
  CodemindPermissionRequest,
  CodemindProtectedPathClass,
  CodemindProtectedPathHit,
  CodemindRiskLevel,
  CodemindTarget,
  CodemindTargetKind,
  CodemindToolCategory,
  CodemindTrustZone,
} from './permissions/codemind-permission.types.js';

export {
  canAjnaDeclareMergeReady,
  deriveAjnaMergeReadiness,
  isAjnaBlockedStatus,
} from './ajna/ajna-merge-readiness.js';
export {
  AJNA_EVIDENCE_CLASSES,
  AJNA_FINDING_CATEGORIES,
  AJNA_MERGE_READINESS_STATUSES,
  AJNA_RISK_LEVELS,
} from './ajna/ajna-review.types.js';
export type {
  AjnaEvidenceClass,
  AjnaEvidenceRef,
  AjnaFindingCategory,
  AjnaMergeReadiness,
  AjnaMergeReadinessStatus,
  AjnaReviewFinding,
  AjnaReviewRequest,
  AjnaReviewResponse,
  AjnaReviewSubject,
  AjnaRiskLevel,
} from './ajna/ajna-review.types.js';

export {
  countProtectedChangedFiles,
  getHighestRepoImpactLevel,
  hasRequiredEvidenceState,
  summarizeReadOnlyRepoContext,
} from './repo-context/repo-context-summary.js';
export type { CodemindRepoContextSummary } from './repo-context/repo-context-summary.js';
export {
  CODEMIND_EVIDENCE_STATES,
  CODEMIND_REPO_FILE_CHANGE_TYPES,
  CODEMIND_REPO_FILE_IMPACT_LEVELS,
} from './repo-context/repo-context.types.js';
export type {
  CodemindChangedFileContext,
  CodemindCiEvidenceContext,
  CodemindDiffHunkContext,
  CodemindEvidenceState,
  CodemindReadOnlyRepoContext,
  CodemindRepoFileChangeType,
  CodemindRepoFileImpactLevel,
  CodemindRepoRef,
  CodemindRepositoryIdentity,
  CodemindTestEvidenceContext,
} from './repo-context/repo-context.types.js';
