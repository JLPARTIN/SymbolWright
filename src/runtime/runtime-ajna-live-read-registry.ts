import { createGitHubLiveReadRuntimeContext, createGitHubLiveReadRuntimeRegistry } from './runtime-github-live-read-registry.js'
import { createRuntimeRegistry } from './registry/runtime-registry.js'
import { GitHubLiveReadPolicyWrapper } from './live-read/github-live-read-policy-wrapper.js'
import { FakeLiveReadClient, type FakeLiveReadClientData } from './live-read/fake-live-read-client.js'
import { createAjnaLiveReadReviewTool } from './tools/ajna-live-read-review-tool.js'
import { createAjnaLiveReadMergeReadinessTool } from './tools/ajna-live-read-merge-readiness-tool.js'
import type { RuntimeToolContext } from './types.js'

export function createAjnaLiveReadRuntimeContext(cwd: string = process.cwd()): RuntimeToolContext {
  return createGitHubLiveReadRuntimeContext(cwd)
}

export function createAjnaLiveReadRuntimeRegistry(clientData: FakeLiveReadClientData) {
  const client = new GitHubLiveReadPolicyWrapper(new FakeLiveReadClient(clientData))

  return createRuntimeRegistry([
    ...createGitHubLiveReadRuntimeRegistry(clientData).list(),
    createAjnaLiveReadReviewTool(client),
    createAjnaLiveReadMergeReadinessTool(client),
  ])
}
