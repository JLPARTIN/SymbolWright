import type { RuntimeToolDefinition, RuntimeToolContext } from '../types.js'
import { executeBashTool } from './bash-tool.js'

export const runTestsTool: RuntimeToolDefinition = {
  name: 'run_tests',
  description: 'Run the project test suite (npm run test) and return results.',
  capability: 'APPROVED_COMMAND',
  execute: async (_input: unknown, context: RuntimeToolContext): Promise<string> => {
    return executeBashTool(
      { command: 'npm run test -- --reporter=verbose 2>&1', timeoutMs: 300000 },
      context.cwd,
      context.policy.allowShell,
      context.approval,
    )
  },
}
