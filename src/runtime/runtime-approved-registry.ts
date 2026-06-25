import { createProposalRuntimeContext, createProposalRuntimeRegistry } from './runtime-proposal-registry.js'
import { createRuntimeRegistry } from './registry/runtime-registry.js'
import { applyEditGatedTool } from './tools/apply-edit-gated-tool.js'
import { commandDryRunGatedTool } from './tools/command-dry-run-gated-tool.js'
import type { RuntimeApproval, RuntimePolicySnapshot, RuntimeToolContext } from './types.js'

export function createApprovedRuntimePolicy(): RuntimePolicySnapshot {
  const proposalContext = createProposalRuntimeContext()

  return {
    mode: 'APPROVED_EXECUTION',
    allowNetwork: false,
    allowShell: false,
    allowWrites: false,
    allowGitHubWrites: false,
    protectedPaths: proposalContext.policy.protectedPaths,
    noisyDirs: proposalContext.policy.noisyDirs,
  }
}

export function createApprovedRuntimeContext(
  approval: RuntimeApproval | undefined,
  cwd: string = process.cwd(),
): RuntimeToolContext {
  const context: RuntimeToolContext = {
    cwd,
    policy: createApprovedRuntimePolicy(),
  }

  if (approval !== undefined) {
    return {
      ...context,
      approval,
    }
  }

  return context
}

export function createApprovedRuntimeRegistry() {
  return createRuntimeRegistry([
    ...createProposalRuntimeRegistry().list(),
    applyEditGatedTool,
    commandDryRunGatedTool,
  ])
}
