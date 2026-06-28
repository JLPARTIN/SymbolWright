import {
  createProposalRuntimeContext,
  createProposalRuntimeRegistry,
} from './runtime-proposal-registry.js'
import { createRuntimeRegistry } from './registry/runtime-registry.js'
import {
  githubCiFixtureReviewTool,
  githubPrFixtureReviewTool,
} from './tools/github-fixture-tools.js'
import type { RuntimeToolContext } from './types.js'

export function createGitHubReadRuntimeContext(cwd: string = process.cwd()): RuntimeToolContext {
  return createProposalRuntimeContext(cwd)
}

export function createGitHubReadRuntimeRegistry() {
  return createRuntimeRegistry([
    ...createProposalRuntimeRegistry().list(),
    githubPrFixtureReviewTool,
    githubCiFixtureReviewTool,
  ])
}
