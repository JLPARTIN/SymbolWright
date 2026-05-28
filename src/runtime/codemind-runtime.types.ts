import type {
  CodemindPermissionDecision,
  CodemindPermissionRequest,
} from '../permissions/codemind-permission.types.js';

export const CODEMIND_RUNTIME_ADAPTER_KINDS = [
  'GITHUB_PR_CONTEXT_READER',
  'AJNA_REVIEW_RUNTIME',
  'REPO_CONTEXT_READER',
  'UNKNOWN',
] as const;
export type CodemindRuntimeAdapterKind =
  (typeof CODEMIND_RUNTIME_ADAPTER_KINDS)[number];

export const CODEMIND_RUNTIME_EXECUTION_MODES = [
  'CONTRACT_ONLY',
  'READ_ONLY',
  'APPROVAL_REQUIRED',
  'DENIED',
] as const;
export type CodemindRuntimeExecutionMode =
  (typeof CODEMIND_RUNTIME_EXECUTION_MODES)[number];

export interface CodemindRuntimeCapabilityFlags {
  readonly readEnabled: boolean;
  readonly writeEnabled: boolean;
  readonly commandExecutionEnabled: boolean;
  readonly networkRuntimeEnabled: boolean;
  readonly githubWriteEnabled: boolean;
  readonly prCommentEnabled: boolean;
  readonly mergeEnabled: boolean;
}

export interface CodemindRuntimeAdapterDescriptor {
  readonly adapterId: string;
  readonly adapterKind: CodemindRuntimeAdapterKind;
  readonly executionMode: CodemindRuntimeExecutionMode;
  readonly capabilityFlags: CodemindRuntimeCapabilityFlags;
  readonly permissionRequest: CodemindPermissionRequest;
}

export interface CodemindRuntimeBoundaryDecision {
  readonly adapterId: string;
  readonly adapterKind: CodemindRuntimeAdapterKind;
  readonly executionMode: CodemindRuntimeExecutionMode;
  readonly allowedToRun: boolean;
  readonly permissionDecision: CodemindPermissionDecision;
  readonly blockedReasons: readonly string[];
  readonly auditRequired: boolean;
}
