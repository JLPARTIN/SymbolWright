import { createGitHubReadRuntimeContext, createGitHubReadRuntimeRegistry } from './runtime-github-read-registry.js'
import { createRuntimeRegistry } from './registry/runtime-registry.js'
import { liveReadPolicyHandshakeTool } from './tools/live-read-policy-tool.js'
import type { RuntimeToolContext } from './types.js'

export function createLiveReadPolicyRuntimeContext(cwd: string = process.cwd()): RuntimeToolContext {
  return createGitHubReadRuntimeContext(cwd)
}

export function createLiveReadPolicyRuntimeRegistry() {
  return createRuntimeRegistry([
    ...createGitHubReadRuntimeRegistry().list(),
    liveReadPolicyHandshakeTool,
  ])
}
