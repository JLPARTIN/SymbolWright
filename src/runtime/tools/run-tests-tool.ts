import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import { executeBashTool } from './bash-tool.js'

export const runTestsTool: RuntimeToolDefinition = {
  name: 'run_tests',
  description: 'Run the project test suite through the authoritative sandbox broker.',
  capability: 'APPROVED_COMMAND',
  execute: async (_input: unknown, context: RuntimeToolContext): Promise<string> =>
    executeBashTool(
      { command: 'npm test', timeoutMs: 300000 },
      context.cwd,
      context.policy.allowShell,
      context.sandboxRunner,
      context.sandboxAuthorization,
      context.untrustedRepositoryContent ? 'external-untrusted' : 'trusted-local',
    ),
}
