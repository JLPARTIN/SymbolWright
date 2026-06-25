import { createValidationCommandRuntimeContext } from './runtime-validation-command-registry.js'
import { createRuntimeRegistry } from './registry/runtime-registry.js'
import { createValidationCommandRuntimeRegistry } from './runtime-validation-command-registry.js'
import { prPreparationTool } from './tools/pr-preparation-tool.js'
import type { FakeLiveReadClientData } from './live-read/fake-live-read-client.js'
import type { RuntimeToolContext } from './types.js'

export function createPrPreparationRuntimeContext(cwd: string = process.cwd()): RuntimeToolContext {
  return createValidationCommandRuntimeContext(cwd)
}

export function createPrPreparationRuntimeRegistry(clientData: FakeLiveReadClientData) {
  return createRuntimeRegistry([
    ...createValidationCommandRuntimeRegistry(clientData).list(),
    prPreparationTool,
  ])
}
