import type { RuntimeToolDefinition, RuntimeToolContext } from '../types.js'
import { executeBashTool } from './bash-tool.js'

export const runTestsTool: RuntimeToolDefinition = {
  name: 'run_tests',
  description: 'Run the project test suite through the zero-trust sandbox runner.',
  capability: 'APPROVED_COMMAND',
  execute: async (_input: unknown, context: RuntimeToolContext): Promise<string> => {
    return executeBashTool(
      { command: 'npm test', timeoutMs: 300000 },
      context.cwd,
      context.policy.allowShell,
      context.sandboxRunner,
    )
  },
}
