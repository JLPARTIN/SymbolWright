import { createReadOnlyRuntimeContext, createReadOnlyRuntimeRegistry } from './runtime-readonly-registry.js'
import { createRuntimeRegistry } from './registry/runtime-registry.js'
import { ciReviewTool } from './tools/ci-review-tool.js'
import { prNotesTool } from './tools/pr-notes-tool.js'
import { proposeEditTool } from './tools/propose-edit-tool.js'
import type { RuntimeToolContext } from './types.js'

export function createProposalRuntimeContext(cwd: string = process.cwd()): RuntimeToolContext {
  return createReadOnlyRuntimeContext(cwd)
}

export function createProposalRuntimeRegistry() {
  return createRuntimeRegistry([
    ...createReadOnlyRuntimeRegistry().list(),
    proposeEditTool,
    prNotesTool,
    ciReviewTool,
  ])
}
