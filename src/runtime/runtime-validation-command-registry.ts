import { createLocalWriteRuntimeContext } from './runtime-local-write-registry.js'
import { createRuntimeRegistry } from './registry/runtime-registry.js'
import { createLocalWriteRuntimeRegistry } from './runtime-local-write-registry.js'
import { validationCommandGateTool } from './tools/validation-command-gate-tool.js'
import type { FakeLiveReadClientData } from './live-read/fake-live-read-client.js'
import type { RuntimeToolContext } from './types.js'

export function createValidationCommandRuntimeContext(cwd: string = process.cwd()): RuntimeToolContext {
  return createLocalWriteRuntimeContext(cwd)
}

export function createValidationCommandRuntimeRegistry(clientData: FakeLiveReadClientData) {
  return createRuntimeRegistry([
    ...createLocalWriteRuntimeRegistry(clientData).list(),
    validationCommandGateTool,
  ])
}
