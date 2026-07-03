import { bridgeToolsForProvider } from '../agent/tool-schema-bridge.js'
import { assembleAgentTools } from '../runtime/tools/tool-assembly.js'
import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'
import type { CodemindRuntimeMode, RuntimeToolContext } from '../runtime/types.js'
import type { McpServerToolHandler } from './mcp-server-protocol.js'

export interface McpServerToolsOptions {
  readonly mode: CodemindRuntimeMode
  readonly cwd: string
  readonly hasGitHubToken?: boolean
}

/**
 * Bridges CodeMind's real runtime tool registry (the same tools
 * `codemind agent` uses) into an MCP tool handler, gated by the same
 * runtime-mode policy as every other CodeMind entry point — a `READ_ONLY`
 * server only advertises read/search/plan tools; `APPROVED_EXECUTION`
 * advertises the full set, including file writes and shell execution.
 */
export function createCodemindMcpToolHandler(options: McpServerToolsOptions): McpServerToolHandler {
  const policy = createRuntimePolicyForMode(options.mode, {
    hasGitHubToken: options.hasGitHubToken ?? false,
  })
  const bridged = bridgeToolsForProvider(assembleAgentTools(), policy)
  const byName = new Map(bridged.map((tool) => [tool.providerTool.name, tool]))
  const context: RuntimeToolContext = { cwd: options.cwd, policy }

  return {
    list: () =>
      bridged.map((tool) => ({
        name: tool.providerTool.name,
        description: tool.providerTool.description,
        inputSchema: tool.providerTool.inputSchema,
      })),

    async call(name, args) {
      const bridgedTool = byName.get(name)
      if (bridgedTool === undefined) {
        return {
          content: [
            {
              type: 'text',
              text: `Unknown or unavailable tool "${name}" (not exposed in ${policy.mode} mode).`,
            },
          ],
          isError: true,
        }
      }

      try {
        const text = await bridgedTool.runtimeTool.execute(args, context)
        return { content: [{ type: 'text', text }] }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: [{ type: 'text', text: `Tool "${name}" failed: ${message}` }],
          isError: true,
        }
      }
    },
  }
}
