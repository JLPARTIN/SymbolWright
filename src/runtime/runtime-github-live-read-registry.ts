import { createLiveReadClientRuntimeContext, createLiveReadClientRuntimeRegistry } from './runtime-live-read-client-registry.js'
import { createRuntimeRegistry } from './registry/runtime-registry.js'
import { GitHubLiveReadPolicyWrapper } from './live-read/github-live-read-policy-wrapper.js'
import { FakeLiveReadClient, type FakeLiveReadClientData } from './live-read/fake-live-read-client.js'
import { createGitHubLiveReadPrTool } from './tools/github-live-read-pr-tool.js'
import { createGitHubLiveReadCiTool } from './tools/github-live-read-ci-tool.js'
import type { RuntimeLiveReadClient } from './live-read/runtime-live-read-client.js'
import type { RuntimeToolContext } from './types.js'

export function createGitHubLiveReadRuntimeContext(cwd: string = process.cwd()): RuntimeToolContext {
  return createLiveReadClientRuntimeContext(cwd)
}

export function createGitHubLiveReadRuntimeRegistry(
  clientData: FakeLiveReadClientData,
  realClient?: RuntimeLiveReadClient,
) {
  const inner = realClient ?? new FakeLiveReadClient(clientData)
  const client = new GitHubLiveReadPolicyWrapper(inner)

  return createRuntimeRegistry([
    ...createLiveReadClientRuntimeRegistry().list(),
    createGitHubLiveReadPrTool(client),
    createGitHubLiveReadCiTool(client),
  ])
}
