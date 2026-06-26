import type { RuntimeToolDefinition, RuntimeToolContext } from '../types.js'
import { executeBashTool } from './bash-tool.js'

export const runTypecheckTool: RuntimeToolDefinition = {
  name: 'run_typecheck',
  description: 'Run TypeScript type checking (npx tsc --noEmit) and return errors.',
  capability: 'APPROVED_COMMAND',
  execute: async (_input: unknown, context: RuntimeToolContext): Promise<string> => {
    return executeBashTool(
      { command: 'npx tsc --noEmit 2>&1 || true', timeoutMs: 120000 },
      context.cwd,
      context.policy.allowShell,
    )
  },
}
