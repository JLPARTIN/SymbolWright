import type { RuntimeToolDefinition, RuntimeToolContext } from '../types.js'
import { executeBashTool } from './bash-tool.js'

export const runLintTool: RuntimeToolDefinition = {
  name: 'run_lint',
  description: 'Run ESLint through the zero-trust sandbox runner.',
  capability: 'APPROVED_COMMAND',
  execute: async (_input: unknown, context: RuntimeToolContext): Promise<string> => {
    return executeBashTool(
      { command: 'npm run lint', timeoutMs: 120000 },
      context.cwd,
      context.policy.allowShell,
      context.sandboxRunner,
    )
  },
}
