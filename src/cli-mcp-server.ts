import { runSymbolWrightMcpServer } from './mcp/mcp-server.js'
import { normalizeSymbolWrightRuntimeMode } from './runtime/policy/runtime-policy.js'
import type { SymbolWrightRuntimeMode } from './runtime/types.js'

/**
 * Deliberately more conservative than `DEFAULT_SYMBOLWRIGHT_RUNTIME_MODE`
 * (`APPROVED_EXECUTION`). That default is right for a session an operator is
 * driving turn-by-turn from their own terminal. `mcp-server` is a background
 * process any MCP-compatible client (Claude Desktop, another agent, etc.)
 * can drive without the operator watching each call, so it starts read-only
 * unless the operator explicitly opts into more with `--mode`.
 */
export const DEFAULT_MCP_SERVER_MODE: SymbolWrightRuntimeMode = 'READ_ONLY'

export interface McpServerCommandArgs {
  readonly mode: SymbolWrightRuntimeMode
}

export function parseMcpServerArgs(args: readonly string[]): McpServerCommandArgs {
  let mode = DEFAULT_MCP_SERVER_MODE

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === undefined) continue

    if (arg === '--mode') {
      const value = normalizeSymbolWrightRuntimeMode(args[++i])
      if (value === undefined) {
        throw new Error(
          '--mode must be one of PLAN_ONLY, READ_ONLY, PROPOSAL_ONLY, APPROVED_EXECUTION',
        )
      }
      mode = value
      continue
    }

    if (arg.startsWith('--mode=')) {
      const value = normalizeSymbolWrightRuntimeMode(arg.slice('--mode='.length))
      if (value === undefined) {
        throw new Error(
          '--mode must be one of PLAN_ONLY, READ_ONLY, PROPOSAL_ONLY, APPROVED_EXECUTION',
        )
      }
      mode = value
      continue
    }

    throw new Error(`Unknown mcp-server flag: ${arg}`)
  }

  return { mode }
}

/** Starts the MCP server over stdio and resolves once the client disconnects. */
export async function runMcpServerCommand(
  args: readonly string[],
  cwd: string = process.cwd(),
): Promise<void> {
  const { mode } = parseMcpServerArgs(args)

  // stdout is the JSON-RPC wire — all diagnostics must go to stderr.
  console.error(`SymbolWright MCP server starting in ${mode} mode (stdio)`)

  const server = runSymbolWrightMcpServer({
    mode,
    cwd,
    hasGitHubToken: process.env['GITHUB_TOKEN'] !== undefined,
  })

  await server.closed
}
