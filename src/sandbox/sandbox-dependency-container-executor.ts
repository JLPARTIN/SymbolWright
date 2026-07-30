import { executeStrongSandboxContainer } from './sandbox-container-backend.js'
import type { ExecuteStrongSandboxContainerInput } from './sandbox-container-backend.js'
import { runWithSandboxDependencyLayer } from './sandbox-dependency-execution-context.js'
import type { ApplicationSandboxNetworkRuntime } from './sandbox-network-runtime.js'

/**
 * Resolves the server-owned layer binding immediately before strong-container execution. The
 * workspace identity comes from the validated request; callers never provide a layer or host path.
 */
export async function executeStrongSandboxContainerWithDependencies(
  runtime: ApplicationSandboxNetworkRuntime,
  input: ExecuteStrongSandboxContainerInput,
): Promise<Awaited<ReturnType<typeof executeStrongSandboxContainer>>> {
  const workspaceId = input.request.missionId ?? input.request.repository?.rootPath
  const dependencyLayer =
    workspaceId === undefined ? undefined : await runtime.dependencyLayers.resolve(workspaceId)
  return runWithSandboxDependencyLayer(dependencyLayer, () => executeStrongSandboxContainer(input))
}
