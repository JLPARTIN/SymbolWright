import { AccessRuntime } from '../access/access-runtime.js'
import { InvalidCredentialError } from '../access/access-grant-service.js'
import { requiredCapabilitiesForTool } from '../access/tool-permission-catalog.js'
import { bridgeToolsForProvider } from '../agent/tool-schema-bridge.js'
import { assembleAgentTools } from '../runtime/tools/tool-assembly.js'
import { runAuthorizedTool } from '../runtime/tools/authorized-tool-execution.js'
import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'
import type { SymbolWrightRuntimeMode, RuntimeToolContext } from '../runtime/types.js'
import type { McpServerToolHandler } from './mcp-server-protocol.js'

export class McpAgentTokenAuthenticationError extends Error {}

export interface McpServerToolsOptions {
  readonly mode: SymbolWrightRuntimeMode
  readonly cwd: string
  readonly hasGitHubToken?: boolean
  /**
   * A `sw_agent_...` bearer token (see `src/access/`). When present, the MCP connection is
   * capability-scoped to the token's grant: `list()` only advertises tools the grant permits, and
   * every `call()` is re-checked against `AuthorizationService` before the tool runs — an agent
   * never sees, let alone can invoke, a tool outside its exact permissions. When absent, behavior
   * is unchanged from before delegated agent access existed: the local, implicitly trusted stdio
   * caller gets the full mode-gated tool set.
   */
  readonly agentToken?: string
}

/**
 * Bridges SymbolWright's real runtime tool registry (the same tools
 * `symbolwright agent` uses) into an MCP tool handler, gated by the same
 * runtime-mode policy as every other SymbolWright entry point — a `READ_ONLY`
 * server only advertises read/search/plan tools; `APPROVED_EXECUTION`
 * advertises the full set, including file writes and shell execution.
 */
export function createSymbolWrightMcpToolHandler(
  options: McpServerToolsOptions,
): McpServerToolHandler {
  const policy = createRuntimePolicyForMode(options.mode, {
    hasGitHubToken: options.hasGitHubToken ?? false,
  })
  const bridged = bridgeToolsForProvider(assembleAgentTools(), policy)
  const byName = new Map(bridged.map((tool) => [tool.providerTool.name, tool]))

  let context: RuntimeToolContext = { cwd: options.cwd, policy }
  let grantedCapabilities: ReadonlySet<string> | undefined

  if (options.agentToken !== undefined) {
    const runtime = new AccessRuntime({ workspaceRoot: options.cwd })
    let authenticated: ReturnType<typeof runtime.grantService.authenticateAgentToken>
    try {
      authenticated = runtime.grantService.authenticateAgentToken(options.agentToken, {
        client: 'mcp-stdio',
      })
    } catch (error) {
      if (error instanceof InvalidCredentialError) {
        throw new McpAgentTokenAuthenticationError(error.message)
      }
      throw error
    }
    const { grant, session } = authenticated
    grantedCapabilities = new Set([...grant.symbolWrightCapabilities, ...grant.githubCapabilities])
    context = {
      ...context,
      accessControl: {
        principalId: grant.principalId,
        grantId: grant.id,
        sessionId: session.id,
        requireAuthorized: async (capability, toolName) => {
          await runtime.authorizationService.requireAuthorized({
            principalId: grant.principalId,
            grantId: grant.id,
            sessionId: session.id,
            capability,
            toolName,
          })
        },
      },
    }
  }

  const isToolPermitted = (toolName: string): boolean => {
    if (grantedCapabilities === undefined) return true
    const required = requiredCapabilitiesForTool(toolName)
    if (required.length === 0) return false
    return required.every((capability) => grantedCapabilities?.has(capability) === true)
  }

  return {
    list: () =>
      bridged
        .filter((tool) => isToolPermitted(tool.providerTool.name))
        .map((tool) => ({
          name: tool.providerTool.name,
          description: tool.providerTool.description,
          inputSchema: tool.providerTool.inputSchema,
        })),

    async call(name, args) {
      const bridgedTool = byName.get(name)
      if (bridgedTool === undefined || !isToolPermitted(name)) {
        return {
          content: [
            {
              type: 'text',
              text: `Unknown or unavailable tool "${name}" (not exposed in ${policy.mode} mode, or not permitted by the active agent grant).`,
            },
          ],
          isError: true,
        }
      }

      try {
        const text = await runAuthorizedTool(bridgedTool.runtimeTool, args, context)
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
