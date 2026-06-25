import { createOperatorReviewRuntimeContext } from './runtime-operator-review-registry.js'
import { createRuntimeRegistry } from './registry/runtime-registry.js'
import { createOperatorReviewRuntimeRegistry } from './runtime-operator-review-registry.js'
import { writeIntentPlanTool } from './tools/write-intent-plan-tool.js'
import type { FakeLiveReadClientData } from './live-read/fake-live-read-client.js'
import type { RuntimeToolContext } from './types.js'

export function createWritePrepRuntimeContext(cwd: string = process.cwd()): RuntimeToolContext {
  return createOperatorReviewRuntimeContext(cwd)
}

export function createWritePrepRuntimeRegistry(clientData: FakeLiveReadClientData) {
  return createRuntimeRegistry([
    ...createOperatorReviewRuntimeRegistry(clientData).list(),
    writeIntentPlanTool,
  ])
}
