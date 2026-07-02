import { createDefaultRuntimePolicy } from './runtime/policy/runtime-policy.js'
import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'
import { discoverMcpTools, renderMcpServerList } from './runtime/mcp/mcp-runtime.js'
import { loadMcpConfig } from './runtime/mcp/mcp-config.js'
import type { McpToolCallInput } from './runtime/mcp/mcp-types.js'

interface ParsedArgs {
  readonly positional: readonly string[]
  readonly configPath?: string
}

function parseArgs(args: readonly string[]): ParsedArgs {
  const positional: string[] = []
  let configPath: string | undefined

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === undefined) {
      continue
    }

    if (arg === '--config') {
      const value = args[index + 1]
      if (value === undefined || value.trim().length === 0) {
        throw new Error('Missing value for --config.')
      }
      configPath = value
      index += 1
      continue
    }

    if (arg.startsWith('--config=')) {
      const value = arg.slice('--config='.length)
      if (value.trim().length === 0) {
        throw new Error('Missing value for --config.')
      }
      configPath = value
      continue
    }

    positional.push(arg)
  }

  return configPath === undefined ? { positional } : { positional, configPath }
}

function parseJsonObject(raw: string | undefined): Readonly<Record<string, unknown>> {
  if (raw === undefined) {
    return {}
  }

  const parsed = JSON.parse(raw) as unknown
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('MCP call arguments must be a JSON object.')
  }
  return parsed as Readonly<Record<string, unknown>>
}

function renderMcpHelp(): string {
  return [
    'CodeMind MCP runtime',
    '',
    'Usage:',
    '  codemind mcp list [--config .codemind/mcp.json]',
    '  codemind mcp tools <server> [--config .codemind/mcp.json]',
    '  codemind mcp call <server> <tool> [json-args] [--config .codemind/mcp.json]',
  ].join('\n')
}

function resolveServerName(
  cwd: string,
  parsed: ParsedArgs,
  maybeServer: string | undefined,
): string {
  if (maybeServer !== undefined) {
    return maybeServer
  }

  const config = loadMcpConfig(cwd, parsed.configPath)
  if (config.servers.length === 1) {
    const onlyServer = config.servers[0]
    if (onlyServer !== undefined) {
      return onlyServer.name
    }
  }

  throw new Error('Missing MCP server name. Run "codemind mcp list" to see configured servers.')
}

export async function renderMcpCommand(
  args: readonly string[],
  cwd: string = process.cwd(),
): Promise<string> {
  const [subcommand, ...rest] = args
  const parsed = parseArgs(rest)

  if (
    subcommand === undefined ||
    subcommand === 'help' ||
    subcommand === '--help' ||
    subcommand === '-h'
  ) {
    return renderMcpHelp()
  }

  if (subcommand === 'list') {
    return renderMcpServerList(loadMcpConfig(cwd, parsed.configPath))
  }

  if (subcommand === 'tools') {
    const serverName = resolveServerName(cwd, parsed, parsed.positional[0])
    return discoverMcpTools({
      cwd,
      policy: createDefaultRuntimePolicy(),
      serverName,
      ...(parsed.configPath === undefined ? {} : { configPath: parsed.configPath }),
    })
  }

  if (subcommand === 'call') {
    const [server, tool, rawArgs] = parsed.positional
    if (server === undefined || tool === undefined) {
      throw new Error('Usage: codemind mcp call <server> <tool> [json-args]')
    }

    const request: McpToolCallInput = {
      server,
      tool,
      arguments: parseJsonObject(rawArgs),
      ...(parsed.configPath === undefined ? {} : { configPath: parsed.configPath }),
    }
    const registry = createFixtureRegistry('mcp')
    const runtimeTool = registry.getOrThrow('mcp_external_call')
    return runtimeTool.execute(request, createFixtureContext(cwd))
  }

  throw new Error(`Unknown MCP command: ${subcommand}`)
}
