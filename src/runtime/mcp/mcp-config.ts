import fs from 'node:fs'
import path from 'node:path'

import { assertReadablePath, resolveWorkspacePath } from '../policy/runtime-policy.js'
import { createRuntimePolicyForMode } from '../policy/runtime-policy.js'
import {
  DEFAULT_MCP_CONFIG_PATH,
  DEFAULT_MCP_TIMEOUT_MS,
  type McpConfig,
  type McpServerConfig,
  type McpServerListEntry,
  type McpToolPolicyDecision,
} from './mcp-types.js'

interface RawMcpServerConfig {
  readonly transport?: unknown
  readonly command?: unknown
  readonly args?: unknown
  readonly env?: unknown
  readonly timeoutMs?: unknown
  readonly allowedTools?: unknown
  readonly blockedTools?: unknown
  readonly deniedTools?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`MCP config field "${field}" must be a non-empty string.`)
  }
  return value
}

function parseStringArray(value: unknown, field: string): readonly string[] {
  if (value === undefined) {
    return []
  }
  if (!Array.isArray(value)) {
    throw new Error(`MCP config field "${field}" must be an array of strings.`)
  }

  return value.map((item, index) => requireNonEmptyString(item, `${field}[${index}]`))
}

function parseOptionalStringArray(value: unknown, field: string): readonly string[] | undefined {
  if (value === undefined) {
    return undefined
  }
  return parseStringArray(value, field)
}

function parseEnv(value: unknown): Readonly<Record<string, string>> {
  if (value === undefined) {
    return {}
  }
  if (!isRecord(value)) {
    throw new Error('MCP config field "env" must be an object of string values.')
  }

  const env: Record<string, string> = {}
  for (const [key, rawValue] of Object.entries(value)) {
    env[requireNonEmptyString(key, 'env key')] = requireNonEmptyString(rawValue, `env.${key}`)
  }
  return env
}

function parseTimeout(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_MCP_TIMEOUT_MS
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 100 || value > 60_000) {
    throw new Error('MCP config field "timeoutMs" must be an integer between 100 and 60000.')
  }
  return value
}

function parseServer(name: string, raw: unknown): McpServerConfig {
  if (!isRecord(raw)) {
    throw new Error(`MCP server "${name}" must be an object.`)
  }

  const server = raw as RawMcpServerConfig
  const transport = server.transport ?? 'stdio'
  if (transport !== 'stdio') {
    throw new Error(`MCP server "${name}" uses unsupported transport: ${String(transport)}`)
  }

  const allowedTools = parseOptionalStringArray(server.allowedTools, `servers.${name}.allowedTools`)
  const blockedTools = [
    ...parseStringArray(server.blockedTools, `servers.${name}.blockedTools`),
    ...parseStringArray(server.deniedTools, `servers.${name}.deniedTools`),
  ]

  const parsed: McpServerConfig = {
    name,
    transport,
    command: requireNonEmptyString(server.command, `servers.${name}.command`),
    args: parseStringArray(server.args, `servers.${name}.args`),
    env: parseEnv(server.env),
    timeoutMs: parseTimeout(server.timeoutMs),
    blockedTools,
  }

  if (allowedTools !== undefined) {
    return { ...parsed, allowedTools }
  }

  return parsed
}

function parseServers(rawServers: unknown): readonly McpServerConfig[] {
  if (Array.isArray(rawServers)) {
    return rawServers.map((server, index) => {
      if (!isRecord(server)) {
        throw new Error(`MCP servers[${index}] must be an object.`)
      }
      return parseServer(requireNonEmptyString(server['name'], `servers[${index}].name`), server)
    })
  }

  if (!isRecord(rawServers)) {
    throw new Error('MCP config field "servers" must be an object or array.')
  }

  return Object.entries(rawServers).map(([name, server]) => parseServer(name, server))
}

export function parseMcpConfigJson(rawJson: string, configPath: string): McpConfig {
  const parsed = JSON.parse(rawJson) as unknown
  if (!isRecord(parsed)) {
    throw new Error('MCP config must be a JSON object.')
  }

  const servers = parseServers(parsed['servers'])
  if (servers.length === 0) {
    throw new Error('MCP config must define at least one server.')
  }

  const names = new Set<string>()
  for (const server of servers) {
    if (names.has(server.name)) {
      throw new Error(`MCP server name is duplicated: ${server.name}`)
    }
    names.add(server.name)
  }

  return { configPath, servers }
}

export function loadMcpConfig(
  workspaceRoot: string,
  configPath: string = DEFAULT_MCP_CONFIG_PATH,
): McpConfig {
  const resolved = resolveWorkspacePath(workspaceRoot, configPath)
  assertReadablePath(createRuntimePolicyForMode('READ_ONLY'), workspaceRoot, resolved)

  if (!fs.existsSync(resolved)) {
    throw new Error(`MCP config file not found: ${path.relative(workspaceRoot, resolved)}`)
  }

  return parseMcpConfigJson(fs.readFileSync(resolved, 'utf8'), path.relative(workspaceRoot, resolved))
}

export function findMcpServer(config: McpConfig, serverName: string): McpServerConfig {
  const server = config.servers.find((candidate) => candidate.name === serverName)
  if (server === undefined) {
    throw new Error(`MCP server not found: ${serverName}`)
  }
  return server
}

export function evaluateMcpToolPolicy(
  server: McpServerConfig,
  toolName: string,
): McpToolPolicyDecision {
  if (server.blockedTools.includes(toolName)) {
    return { allowed: false, reason: `Tool is blocked for MCP server ${server.name}: ${toolName}` }
  }

  if (server.allowedTools !== undefined && !server.allowedTools.includes(toolName)) {
    return { allowed: false, reason: `Tool is not in allowedTools for MCP server ${server.name}: ${toolName}` }
  }

  return { allowed: true, reason: `Tool is allowed for MCP server ${server.name}: ${toolName}` }
}

export function listMcpServers(config: McpConfig): readonly McpServerListEntry[] {
  return config.servers.map((server) => ({
    name: server.name,
    transport: server.transport,
    command: [server.command, ...server.args].join(' '),
    toolPolicy:
      server.allowedTools !== undefined
        ? `allow: ${server.allowedTools.join(', ')}`
        : server.blockedTools.length > 0
          ? `block: ${server.blockedTools.join(', ')}`
          : 'allow all discovered tools',
  }))
}

export function getMcpRedactionSecrets(server: McpServerConfig): readonly string[] {
  return Object.values(server.env).filter((value) => value.trim().length >= 4)
}
