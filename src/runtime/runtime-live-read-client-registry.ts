import {
  createLiveReadPolicyRuntimeContext,
  createLiveReadPolicyRuntimeRegistry,
} from './runtime-live-read-policy-registry.js'
import { createRuntimeRegistry } from './registry/runtime-registry.js'
import { liveReadClientFixtureTool } from './tools/live-read-client-fixture-tool.js'
import type { RuntimeToolContext } from './types.js'

export function createLiveReadClientRuntimeContext(
  cwd: string = process.cwd(),
): RuntimeToolContext {
  return createLiveReadPolicyRuntimeContext(cwd)
}

export function createLiveReadClientRuntimeRegistry() {
  return createRuntimeRegistry([
    ...createLiveReadPolicyRuntimeRegistry().list(),
    liveReadClientFixtureTool,
  ])
}
