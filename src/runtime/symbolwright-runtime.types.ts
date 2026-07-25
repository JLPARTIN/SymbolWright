import type {
  SymbolWrightPermissionDecision,
  SymbolWrightPermissionRequest,
} from '../permissions/symbolwright-permission.types.js'

export const SYMBOLWRIGHT_RUNTIME_ADAPTER_KINDS = [
  'GITHUB_PR_CONTEXT_READER',
  'AJNA_REVIEW_RUNTIME',
  'REPO_CONTEXT_READER',
  'UNKNOWN',
] as const
export type SymbolWrightRuntimeAdapterKind = (typeof SYMBOLWRIGHT_RUNTIME_ADAPTER_KINDS)[number]

export const SYMBOLWRIGHT_RUNTIME_EXECUTION_MODES = [
  'CONTRACT_ONLY',
  'READ_ONLY',
  'APPROVAL_REQUIRED',
  'DENIED',
] as const
export type SymbolWrightRuntimeExecutionMode = (typeof SYMBOLWRIGHT_RUNTIME_EXECUTION_MODES)[number]

export interface SymbolWrightRuntimeCapabilityFlags {
  readonly readEnabled: boolean
  readonly writeEnabled: boolean
  readonly commandExecutionEnabled: boolean
  readonly networkRuntimeEnabled: boolean
  readonly githubWriteEnabled: boolean
  readonly prCommentEnabled: boolean
  readonly mergeEnabled: boolean
}

export interface SymbolWrightRuntimeAdapterDescriptor {
  readonly adapterId: string
  readonly adapterKind: SymbolWrightRuntimeAdapterKind
  readonly executionMode: SymbolWrightRuntimeExecutionMode
  readonly capabilityFlags: SymbolWrightRuntimeCapabilityFlags
  readonly permissionRequest: SymbolWrightPermissionRequest
}

export interface SymbolWrightRuntimeBoundaryDecision {
  readonly adapterId: string
  readonly adapterKind: SymbolWrightRuntimeAdapterKind
  readonly executionMode: SymbolWrightRuntimeExecutionMode
  readonly allowedToRun: boolean
  readonly permissionDecision: SymbolWrightPermissionDecision
  readonly blockedReasons: readonly string[]
  readonly auditRequired: boolean
}
