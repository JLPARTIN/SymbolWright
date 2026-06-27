import type { RuntimeToolDefinition, RuntimeToolContext } from '../types.js'
import { executeBashTool } from './bash-tool.js'

export const runLintTool: RuntimeToolDefinition = {
  name: 'run_lint',
  description: 'Run ESLint (npm run lint) and return results.',
  capability: 'APPROVED_COMMAND',
  execute: async (_input: unknown, context: RuntimeToolContext): Promise<string> => {
    return executeBashTool(
      { command: 'npm run lint 2>&1', timeoutMs: 120000 },
      context.cwd,
      context.policy.allowShell,
      context.approval,
    )
  },
}
