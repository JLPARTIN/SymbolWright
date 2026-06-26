import { createRuntimeRegistry } from './registry/runtime-registry.js'
import { zflowReportTool } from './tools/zflow-report-tool.js'
import type { RuntimeToolContext } from './types.js'

export function createZflowReportRuntimeContext(cwd: string = process.cwd()): RuntimeToolContext {
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

export function createZflowReportRuntimeRegistry() {
  return createRuntimeRegistry([zflowReportTool])
}
