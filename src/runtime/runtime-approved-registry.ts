import { createProposalRuntimeContext, createProposalRuntimeRegistry } from './runtime-proposal-registry.js'
import { createRuntimeRegistry } from './registry/runtime-registry.js'
import { applyEditGatedTool } from './tools/apply-edit-gated-tool.js'
import { commandDryRunGatedTool } from './tools/command-dry-run-gated-tool.js'
import type { RuntimeApproval, RuntimePolicySnapshot, RuntimeToolContext } from './types.js'

export function createApprovedRuntimePolicy(): RuntimePolicySnapshot {
  return {
    mode: 'APPROVED_EXECUTION',
    allowNetwork: false,
    allowShell: false,
    allowWrites: false,
    protectedPaths: createProposalRuntimeContext().policy.protectedPaths,
    noisyDirs: createProposalRuntimeContext().policy.noisyDirs,
  }
}

export function createApprovedRuntimeContext(
  approval: RuntimeApproval | undefined,
  cwd: string = process.cwd(),
): RuntimeToolContext {
  return {
    cwd,
    policy: createApprovedRuntimePolicy(),
    approval,
  }
}

export function createApprovedRuntimeRegistry() {
  return createRuntimeRegistry([
    ...createProposalRuntimeRegistry().list(),
    applyEditGatedTool,
    commandDryRunGatedTool,
  ])
}
