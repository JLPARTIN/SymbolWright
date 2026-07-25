import { loadMcpConfig } from './mcp/mcp-config.js'
import { callMcpTool, discoverMcpTools, listMcpServers } from './mcp/mcp-runtime.js'
import { renderMcpCallEvidence } from './runtime/tools/mcp-call-tool.js'
import {
  createRuntimePolicyForMode,
  DEFAULT_SYMBOLWRIGHT_RUNTIME_MODE,
  normalizeSymbolWrightRuntimeMode,
} from './runtime/policy/runtime-policy.js'
import type { RuntimePolicySnapshot } from './runtime/types.js'

interface ParsedMcpFlags {
  readonly positionals: readonly string[]
  readonly configPath?: string
  readonly timeoutMs?: number
  readonly policy: RuntimePolicySnapshot
}

function parseMcpFlags(args: readonly string[]): ParsedMcpFlags {
  const positionals: string[] = []
  let configPath: string | undefined
  let timeoutMs: number | undefined
  let mode = DEFAULT_SYMBOLWRIGHT_RUNTIME_MODE

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--config') {
      configPath = args[++i]
      continue
    }
    if (arg === '--timeout') {
      const value = Number(args[++i])
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('--timeout must be a positive number of milliseconds')
      }
      timeoutMs = value
      continue
    }
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
    if (arg !== undefined) {
      positionals.push(arg)
    }
  }

  return {
    positionals,
    ...(configPath !== undefined ? { configPath } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    policy: createRuntimePolicyForMode(mode, { hasGitHubToken: false }),
  }
}

export async function renderMcpListCommand(
  args: readonly string[],
  cwd: string = process.cwd(),
): Promise<string> {
  const { configPath, policy } = parseMcpFlags(args)
  const config = loadMcpConfig(cwd, configPath)
  const serverNames = Object.keys(config.servers)

  if (serverNames.length === 0) {
    return [
      'SymbolWright MCP servers',
      '',
      'No servers configured. Add entries to .symbolwright/mcp.json to get started.',
      'See docs/runtime/SYMBOLWRIGHT_MCP_TOOL_RUNTIME.md for the config schema and a working example.',
    ].join('\n')
  }

  const statuses = await listMcpServers(config, policy)

  const lines = ['SymbolWright MCP servers', '']
  for (const status of statuses) {
    const reachability = status.reachable
      ? `reachable (${status.toolCount ?? 0} tools)`
      : 'unreachable'
    lines.push(`- ${status.name}: ${status.command} ${status.args.join(' ')} — ${reachability}`)
    if (status.error !== undefined) {
      lines.push(`  reason: ${status.error}`)
    }
  }

  return lines.join('\n')
}

export async function renderMcpToolsCommand(
  args: readonly string[],
  cwd: string = process.cwd(),
): Promise<string> {
  const { positionals, configPath, policy } = parseMcpFlags(args)
  const serverName = positionals[0]
  const config = loadMcpConfig(cwd, configPath)

  const listings = await discoverMcpTools(config, policy, serverName)

  const lines = ['SymbolWright MCP tools', '']
  for (const listing of listings) {
    lines.push(`Server: ${listing.server}`)
    if (listing.tools.length === 0) {
      lines.push('  (no tools advertised)')
    }
    for (const tool of listing.tools) {
      lines.push(`  - ${tool.name}${tool.description !== undefined ? `: ${tool.description}` : ''}`)
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}

function resolveCallTarget(
  target: string,
  configuredServers: readonly string[],
): { readonly server: string; readonly tool: string } {
  const dotIndex = target.indexOf('.')
  if (dotIndex > 0) {
    return { server: target.slice(0, dotIndex), tool: target.slice(dotIndex + 1) }
  }

  if (configuredServers.length === 1) {
    return { server: configuredServers[0] as string, tool: target }
  }

  throw new Error(
    `Ambiguous tool target "${target}". Use "<server>.<tool>" — configured servers: ${
      configuredServers.length > 0 ? configuredServers.join(', ') : '(none configured)'
    }`,
  )
}

export async function renderMcpCallCommand(
  args: readonly string[],
  cwd: string = process.cwd(),
): Promise<string> {
  const { positionals, configPath, timeoutMs, policy } = parseMcpFlags(args)
  const target = positionals[0]
  if (target === undefined) {
    throw new Error('Usage: symbolwright mcp call <server.tool|tool> [json-arguments]')
  }

  const config = loadMcpConfig(cwd, configPath)
  const { server, tool } = resolveCallTarget(target, Object.keys(config.servers))

  let toolArguments: Record<string, unknown> = {}
  const rawArguments = positionals[1]
  if (rawArguments !== undefined) {
    try {
      const parsed: unknown = JSON.parse(rawArguments)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('arguments JSON must be an object')
      }
      toolArguments = parsed as Record<string, unknown>
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to parse tool arguments as JSON: ${message}`)
    }
  }

  const evidence = await callMcpTool({
    config,
    policy,
    server,
    toolName: tool,
    arguments: toolArguments,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  })

  return renderMcpCallEvidence(evidence)
}
