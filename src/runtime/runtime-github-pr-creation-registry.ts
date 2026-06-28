import {
  createGitHubWriteGateRuntimeContext,
  createGitHubWriteGateRuntimeRegistry,
} from './runtime-github-write-gate-registry.js'
import { createRuntimeRegistry } from './registry/runtime-registry.js'
import { githubCreatePrTool } from './tools/github-create-pr-tool.js'
import type { FakeLiveReadClientData } from './live-read/fake-live-read-client.js'
import type { RuntimeToolContext } from './types.js'

export function createGitHubPrCreationRuntimeContext(
  cwd: string = process.cwd(),
): RuntimeToolContext {
  return createGitHubWriteGateRuntimeContext(cwd)
}

export function createGitHubPrCreationRuntimeRegistry(clientData: FakeLiveReadClientData) {
  return createRuntimeRegistry([
    ...createGitHubWriteGateRuntimeRegistry(clientData).list(),
    githubCreatePrTool,
  ])
}
