import {
  acquireGovernedNpmDependencies,
  parseGovernedDependencyAcquisitionRequest,
  renderGovernedDependencyAcquisitionResult,
} from '../../sandbox/governed-dependency-acquisition.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'

export const dependencyAcquireTool: RuntimeToolDefinition = {
  name: 'dependency_acquire',
  description:
    'Acquire the authorized mission workspace npm lockfile through SymbolWright policy, integrity, archive-inspection, cache, evidence, and immutable-layer controls. The caller cannot supply paths, package text, policy, grant, approval, or container networking.',
  capability: 'APPROVED_COMMAND',
  execute: async (input: unknown, context: RuntimeToolContext): Promise<string> => {
    if (context.policy.mode !== 'APPROVED_EXECUTION') {
      throw new Error('dependency_acquire requires APPROVED_EXECUTION mode.')
    }
    if (context.sandboxNetworkRuntime === undefined) {
      throw new Error('The application-owned sandbox network runtime is unavailable.')
    }
    if (context.sandboxDependencyAuthorization === undefined) {
      throw new Error(
        'No server-derived dependency policy reference is authorized for this workspace.',
      )
    }
    const request = parseGovernedDependencyAcquisitionRequest(input)
    const result = await acquireGovernedNpmDependencies({
      workspaceRoot: context.cwd,
      runtime: context.sandboxNetworkRuntime,
      authorization: context.sandboxDependencyAuthorization,
      request,
    })
    await context.recordDependencyAcquisition?.(result)
    return renderGovernedDependencyAcquisitionResult(result)
  },
}
