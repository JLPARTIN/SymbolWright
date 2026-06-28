import {
  createGitHubWriteGateRuntimeContext,
  createGitHubWriteGateRuntimeRegistry,
} from './runtime-github-write-gate-registry.js'
import type { FakeLiveReadClientData } from './live-read/fake-live-read-client.js'
import type { RuntimeToolContext } from './types.js'

export function createWorkflowRuntimeContext(cwd: string = process.cwd()): RuntimeToolContext {
  return createGitHubWriteGateRuntimeContext(cwd)
}

export function createWorkflowRuntimeRegistry(clientData: FakeLiveReadClientData) {
  return createGitHubWriteGateRuntimeRegistry(clientData)
}
