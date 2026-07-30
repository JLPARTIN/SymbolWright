import { AsyncLocalStorage } from 'node:async_hooks'

import type { StrongSandboxDependencyLayer } from './npm-dependency-layer.js'

const dependencyLayerStorage = new AsyncLocalStorage<StrongSandboxDependencyLayer>()

/**
 * Carries a verified, server-owned dependency layer through one asynchronous sandbox execution.
 * It is not request data and cannot be selected by a tool caller.
 */
export function runWithSandboxDependencyLayer<T>(
  layer: StrongSandboxDependencyLayer | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  return layer === undefined ? operation() : dependencyLayerStorage.run(layer, operation)
}

export function currentSandboxDependencyLayer(): StrongSandboxDependencyLayer | undefined {
  return dependencyLayerStorage.getStore()
}
