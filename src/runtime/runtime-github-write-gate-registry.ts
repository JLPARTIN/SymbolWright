import { createGitHubWriteProposalRuntimeContext } from './runtime-github-write-proposal-registry.js'
import { createRuntimeRegistry } from './registry/runtime-registry.js'
import { createGitHubWriteProposalRuntimeRegistry } from './runtime-github-write-proposal-registry.js'
import { githubWriteGateTool } from './tools/github-write-gate-tool.js'
import type { FakeLiveReadClientData } from './live-read/fake-live-read-client.js'
import type { RuntimeToolContext } from './types.js'

export function createGitHubWriteGateRuntimeContext(cwd: string = process.cwd()): RuntimeToolContext {
  return createGitHubWriteProposalRuntimeContext(cwd)
}

export function createGitHubWriteGateRuntimeRegistry(clientData: FakeLiveReadClientData) {
  return createRuntimeRegistry([
    ...createGitHubWriteProposalRuntimeRegistry(clientData).list(),
    githubWriteGateTool,
  ])
}
