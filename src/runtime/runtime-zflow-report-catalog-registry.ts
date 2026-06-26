import { createRuntimeRegistry } from './registry/runtime-registry.js'
import { zflowReportCatalogTool } from './tools/zflow-report-catalog-tool.js'
import type { RuntimeToolContext } from './types.js'

export function createZflowReportCatalogRuntimeContext(cwd: string = process.cwd()): RuntimeToolContext {
  return {
    cwd,
    policy: {
      mode: 'READ_ONLY',
      allowNetwork: false,
      allowShell: false,
      allowWrites: false,
      allowGitHubWrites: false,
      protectedPaths: ['.git', '.env', '.env.local', 'node_modules', 'dist', 'coverage'],
      noisyDirs: [],
    },
  }
}

export function createZflowReportCatalogRuntimeRegistry() {
  return createRuntimeRegistry([zflowReportCatalogTool])
}
