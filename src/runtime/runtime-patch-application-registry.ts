import type { FakeLiveReadClientData } from './live-read/fake-live-read-client.js'
import {
  createLocalWriteRuntimeContext,
  createLocalWriteRuntimeRegistry,
} from './runtime-local-write-registry.js'
import { createRuntimeRegistry } from './registry/runtime-registry.js'
import { applyPatchTool } from './tools/apply-patch-tool.js'
import type { RuntimeToolContext } from './types.js'

export function createPatchApplicationRuntimeContext(
  cwd: string = process.cwd(),
): RuntimeToolContext {
  return createLocalWriteRuntimeContext(cwd)
}

export function createPatchApplicationRuntimeRegistry(clientData: FakeLiveReadClientData) {
  return createRuntimeRegistry([
    ...createLocalWriteRuntimeRegistry(clientData).list(),
    applyPatchTool,
  ])
}
