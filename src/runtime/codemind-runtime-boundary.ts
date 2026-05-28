import { evaluateCodemindPermissionRequest } from '../permissions/codemind-permission-policy.js';
import type {
  CodemindRuntimeAdapterDescriptor,
  CodemindRuntimeBoundaryDecision,
} from './codemind-runtime.types.js';

function collectCapabilityNotes(
  descriptor: CodemindRuntimeAdapterDescriptor,
): string[] {
  const notes: string[] = [];
  const flags = descriptor.capabilityFlags;

  if (flags.writeEnabled) {
    notes.push('Runtime write capability is not enabled for this phase.');
  }

  if (flags.commandExecutionEnabled) {
    notes.push('Runtime command capability is not enabled for this phase.');
  }

  if (flags.githubWriteEnabled) {
    notes.push('GitHub write capability is not enabled for this phase.');
  }

  if (flags.prCommentEnabled) {
    notes.push('PR comment capability is not enabled for this phase.');
  }

  if (flags.mergeEnabled) {
    notes.push('Merge capability is not enabled for this phase.');
  }

  if (flags.networkRuntimeEnabled && descriptor.executionMode !== 'READ_ONLY') {
    notes.push('Network runtime requires READ_ONLY execution mode in this phase.');
  }

  if (descriptor.executionMode === 'DENIED') {
    notes.push('Adapter execution mode is DENIED.');
  }

  return notes;
}

export function evaluateCodemindRuntimeBoundary(
  descriptor: CodemindRuntimeAdapterDescriptor,
): CodemindRuntimeBoundaryDecision {
  const permissionDecision = evaluateCodemindPermissionRequest(
    descriptor.permissionRequest,
  );
  const blockedReasons = collectCapabilityNotes(descriptor);
  const allowedToRun =
    permissionDecision.disposition === 'ALLOW' && blockedReasons.length === 0;

  return {
    adapterId: descriptor.adapterId,
    adapterKind: descriptor.adapterKind,
    executionMode: descriptor.executionMode,
    allowedToRun,
    permissionDecision,
    blockedReasons,
    auditRequired: permissionDecision.auditRequired || blockedReasons.length > 0,
  };
}

export function createReadOnlyRuntimeCapabilityFlags() {
  return {
    readEnabled: true,
    writeEnabled: false,
    commandExecutionEnabled: false,
    networkRuntimeEnabled: false,
    githubWriteEnabled: false,
    prCommentEnabled: false,
    mergeEnabled: false,
  } as const;
}
