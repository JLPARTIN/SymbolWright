import { createPrPreparationRuntimeContext } from './runtime-pr-preparation-registry.js'
import { createRuntimeRegistry } from './registry/runtime-registry.js'
import { createPrPreparationRuntimeRegistry } from './runtime-pr-preparation-registry.js'
import { githubWriteProposalTool } from './tools/github-write-proposal-tool.js'
import type { FakeLiveReadClientData } from './live-read/fake-live-read-client.js'
import type { RuntimeToolContext } from './types.js'

export function createGitHubWriteProposalRuntimeContext(
  cwd: string = process.cwd(),
): RuntimeToolContext {
  return createPrPreparationRuntimeContext(cwd)
}

export function createGitHubWriteProposalRuntimeRegistry(clientData: FakeLiveReadClientData) {
  return createRuntimeRegistry([
    ...createPrPreparationRuntimeRegistry(clientData).list(),
    githubWriteProposalTool,
  ])
}
