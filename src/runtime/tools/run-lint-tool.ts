import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import { executeBashTool } from './bash-tool.js'

export const runLintTool: RuntimeToolDefinition = {
  name: 'run_lint',
  description: 'Run ESLint through the authoritative sandbox broker.',
  capability: 'APPROVED_COMMAND',
  execute: async (_input: unknown, context: RuntimeToolContext): Promise<string> =>
    executeBashTool(
      { command: 'npm run lint', timeoutMs: 120000 },
      context.cwd,
      context.policy.allowShell,
      context.sandboxRunner,
      context.sandboxAuthorization,
      context.untrustedRepositoryContent ? 'external-untrusted' : 'trusted-local',
    ),
}
