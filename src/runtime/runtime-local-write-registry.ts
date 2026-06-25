import { createWritePrepRuntimeContext } from './runtime-write-prep-registry.js'
import { createRuntimeRegistry } from './registry/runtime-registry.js'
import { createWritePrepRuntimeRegistry } from './runtime-write-prep-registry.js'
import { localFileWriteTool } from './tools/local-file-write-tool.js'
import type { FakeLiveReadClientData } from './live-read/fake-live-read-client.js'
import type { RuntimeToolContext } from './types.js'

export function createLocalWriteRuntimeContext(cwd: string = process.cwd()): RuntimeToolContext {
  return createWritePrepRuntimeContext(cwd)
}

export function createLocalWriteRuntimeRegistry(clientData: FakeLiveReadClientData) {
  return createRuntimeRegistry([
    ...createWritePrepRuntimeRegistry(clientData).list(),
    localFileWriteTool,
  ])
}
