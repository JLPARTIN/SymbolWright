import { createAjnaLiveReadRuntimeContext } from './runtime-ajna-live-read-registry.js'
import { createRuntimeRegistry } from './registry/runtime-registry.js'
import { createAjnaLiveReadRuntimeRegistry } from './runtime-ajna-live-read-registry.js'
import { operatorReviewPacketTool } from './tools/operator-review-packet-tool.js'
import type { FakeLiveReadClientData } from './live-read/fake-live-read-client.js'
import type { RuntimeToolContext } from './types.js'

export function createOperatorReviewRuntimeContext(
  cwd: string = process.cwd(),
): RuntimeToolContext {
  return createAjnaLiveReadRuntimeContext(cwd)
}

export function createOperatorReviewRuntimeRegistry(clientData: FakeLiveReadClientData) {
  return createRuntimeRegistry([
    ...createAjnaLiveReadRuntimeRegistry(clientData).list(),
    operatorReviewPacketTool,
  ])
}
