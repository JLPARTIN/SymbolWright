import type { FakeLiveReadClientData } from './live-read/fake-live-read-client.js'
import { createRuntimeRegistry } from './registry/runtime-registry.js'
import {
  createValidationCommandRuntimeContext,
  createValidationCommandRuntimeRegistry,
} from './runtime-validation-command-registry.js'
import { applyPatchTool } from './tools/apply-patch-tool.js'
import type { RuntimeToolContext } from './types.js'

export function createLocalSelfEditRuntimeContext(cwd: string = process.cwd()): RuntimeToolContext {
  return createValidationCommandRuntimeContext(cwd)
}

export function createLocalSelfEditRuntimeRegistry(clientData: FakeLiveReadClientData) {
  return createRuntimeRegistry([
    ...createValidationCommandRuntimeRegistry(clientData).list(),
    applyPatchTool,
  ])
}
