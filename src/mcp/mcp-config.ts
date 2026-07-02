import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/** Default timeout applied to any MCP request that doesn't set its own. */
export const DEFAULT_MCP_TIMEOUT_MS = 15_000

/** A single stdio MCP server entry resolved from `.codemind/mcp.json`. */
export interface McpServerConfig {
  readonly name: string
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly cwd?: string
  readonly timeoutMs: number
}

/** The full set of configured MCP servers, keyed by server name. */
export interface McpConfig {
  readonly servers: Readonly<Record<string, McpServerConfig>>
}

export const EMPTY_MCP_CONFIG: McpConfig = { servers: {} }

/** Resolves the default `.codemind/mcp.json` path for a workspace root. */
export function resolveMcpConfigPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.codemind', 'mcp.json')
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`)
  }
  return value as Record<string, unknown>
}

function parseServerEntry(name: string, raw: unknown): McpServerConfig {
  const entry = assertRecord(raw, `mcp.json servers["${name}"]`)

  if (typeof entry['command'] !== 'string' || entry['command'].trim().length === 0) {
    throw new Error(`mcp.json servers["${name}"].command must be a non-empty string`)
  }

  let args: readonly string[] = []
  if (entry['args'] !== undefined) {
    if (!Array.isArray(entry['args']) || entry['args'].some((a) => typeof a !== 'string')) {
      throw new Error(`mcp.json servers["${name}"].args must be an array of strings`)
    }
    args = entry['args'] as readonly string[]
  }

  const env: Record<string, string> = {}
  if (entry['env'] !== undefined) {
    const rawEnv = assertRecord(entry['env'], `mcp.json servers["${name}"].env`)
    for (const [key, value] of Object.entries(rawEnv)) {
      if (typeof value !== 'string') {
        throw new Error(`mcp.json servers["${name}"].env["${key}"] must be a string`)
      }
      env[key] = value
    }
  }

  let cwd: string | undefined
  if (entry['cwd'] !== undefined) {
    if (typeof entry['cwd'] !== 'string' || entry['cwd'].trim().length === 0) {
      throw new Error(`mcp.json servers["${name}"].cwd must be a non-empty string`)
    }
    cwd = entry['cwd']
  }

  let timeoutMs = DEFAULT_MCP_TIMEOUT_MS
  if (entry['timeoutMs'] !== undefined) {
    if (typeof entry['timeoutMs'] !== 'number' || !Number.isFinite(entry['timeoutMs']) || entry['timeoutMs'] <= 0) {
      throw new Error(`mcp.json servers["${name}"].timeoutMs must be a positive number`)
    }
    timeoutMs = entry['timeoutMs']
  }

  return {
    name,
    command: entry['command'],
    args,
    env,
    ...(cwd !== undefined ? { cwd } : {}),
    timeoutMs,
  }
}

/** Parses and validates raw `.codemind/mcp.json` content. Throws on malformed config. */
export function parseMcpConfig(raw: string): McpConfig {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`mcp.json is not valid JSON: ${message}`)
  }

  const root = assertRecord(parsed, 'mcp.json')
  const rawServers = root['servers'] === undefined ? {} : assertRecord(root['servers'], 'mcp.json.servers')

  const servers: Record<string, McpServerConfig> = {}
  for (const [name, value] of Object.entries(rawServers)) {
    if (name.trim().length === 0) {
      throw new Error('mcp.json server names must be non-empty strings')
    }
    servers[name] = parseServerEntry(name, value)
  }

  return { servers }
}

/**
 * Loads `.codemind/mcp.json` from a workspace root (or an explicit path override).
 * Returns an empty config — not an error — when no file exists, so MCP stays
 * fully optional for repos that haven't opted in.
 */
export function loadMcpConfig(workspaceRoot: string, explicitPath?: string): McpConfig {
  const configPath = explicitPath ?? resolveMcpConfigPath(workspaceRoot)

  if (!existsSync(configPath)) {
    return EMPTY_MCP_CONFIG
  }

  const raw = readFileSync(configPath, 'utf-8')
  return parseMcpConfig(raw)
}

/** Looks up a single server by name, throwing a clear error if it's not configured. */
export function requireMcpServer(config: McpConfig, name: string): McpServerConfig {
  const server = config.servers[name]
  if (server === undefined) {
    const known = Object.keys(config.servers)
    const knownList = known.length > 0 ? known.join(', ') : '(none configured)'
    throw new Error(`Unknown MCP server "${name}". Configured servers: ${knownList}`)
  }
  return server
}
