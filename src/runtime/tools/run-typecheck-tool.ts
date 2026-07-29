import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import { executeBashTool } from './bash-tool.js'

export const runTypecheckTool: RuntimeToolDefinition = {
  name: 'run_typecheck',
  description: 'Run TypeScript type checking through the authoritative sandbox broker.',
  capability: 'APPROVED_COMMAND',
  execute: async (_input: unknown, context: RuntimeToolContext): Promise<string> =>
    executeBashTool(
      { command: 'npm run typecheck', timeoutMs: 120000 },
      context.cwd,
      context.policy.allowShell,
      context.sandboxRunner,
      context.sandboxAuthorization,
      context.untrustedRepositoryContent ? 'external-untrusted' : 'trusted-local',
    ),
}
