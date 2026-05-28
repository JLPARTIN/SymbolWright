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
