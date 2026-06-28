import {
  createGitHubPrCreationRuntimeContext,
  createGitHubPrCreationRuntimeRegistry,
} from './runtime-github-pr-creation-registry.js'
import { createRuntimeRegistry } from './registry/runtime-registry.js'
import { prCollaborationTool } from './tools/pr-collaboration-tool.js'
import type { FakeLiveReadClientData } from './live-read/fake-live-read-client.js'
import type { RuntimeToolContext } from './types.js'

export function createPrCollaborationRuntimeContext(
  cwd: string = process.cwd(),
): RuntimeToolContext {
  return createGitHubPrCreationRuntimeContext(cwd)
}

export function createPrCollaborationRuntimeRegistry(clientData: FakeLiveReadClientData) {
  return createRuntimeRegistry([
    ...createGitHubPrCreationRuntimeRegistry(clientData).list(),
    prCollaborationTool,
  ])
}
