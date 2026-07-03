import { runCodemindMcpServer } from './mcp/mcp-server.js'
import { normalizeCodemindRuntimeMode } from './runtime/policy/runtime-policy.js'
import type { CodemindRuntimeMode } from './runtime/types.js'

/**
 * Deliberately more conservative than `DEFAULT_CODEMIND_RUNTIME_MODE`
 * (`APPROVED_EXECUTION`). That default is right for a session an operator is
 * driving turn-by-turn from their own terminal. `mcp-server` is a background
 * process any MCP-compatible client (Claude Desktop, another agent, etc.)
 * can drive without the operator watching each call, so it starts read-only
 * unless the operator explicitly opts into more with `--mode`.
 */
export const DEFAULT_MCP_SERVER_MODE: CodemindRuntimeMode = 'READ_ONLY'

export interface McpServerCommandArgs {
  readonly mode: CodemindRuntimeMode
}

export function parseMcpServerArgs(args: readonly string[]): McpServerCommandArgs {
  let mode = DEFAULT_MCP_SERVER_MODE

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === undefined) continue

    if (arg === '--mode') {
      const value = normalizeCodemindRuntimeMode(args[++i])
      if (value === undefined) {
        throw new Error(
          '--mode must be one of PLAN_ONLY, READ_ONLY, PROPOSAL_ONLY, APPROVED_EXECUTION',
        )
      }
      mode = value
      continue
    }

    if (arg.startsWith('--mode=')) {
      const value = normalizeCodemindRuntimeMode(arg.slice('--mode='.length))
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
  console.error(`CodeMind MCP server starting in ${mode} mode (stdio)`)

  const server = runCodemindMcpServer({
    mode,
    cwd,
    hasGitHubToken: process.env['GITHUB_TOKEN'] !== undefined,
  })

  await server.closed
}
