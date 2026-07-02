import { createAuditEvent, renderAuditEvents } from '../audit/runtime-audit-log.js'
import { assertShellAllowed } from '../policy/runtime-policy.js'
import type { RuntimePolicySnapshot } from '../types.js'
import {
  evaluateMcpToolPolicy,
  findMcpServer,
  getMcpRedactionSecrets,
  listMcpServers,
  loadMcpConfig,
} from './mcp-config.js'
import { redactMcpJson } from './mcp-redaction.js'
import { StdioMcpClient } from './stdio-mcp-client.js'
import type { McpConfig, McpToolCallInput, McpToolCallResult } from './mcp-types.js'

function renderUnknownJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'undefined'
}

export function renderMcpServerList(config: McpConfig): string {
  const servers = listMcpServers(config)

  return [
    'CodeMind MCP servers',
    '',
    `Config: ${config.configPath}`,
    '',
    ...servers.map(
      (server) =>
        `- ${server.name} (${server.transport}) ${server.command}\n  Tool policy: ${server.toolPolicy}`,
    ),
  ].join('\n')
}

export async function discoverMcpTools(input: {
  readonly cwd: string
  readonly policy: RuntimePolicySnapshot
  readonly serverName: string
  readonly configPath?: string
}): Promise<string> {
  assertShellAllowed(input.policy)
  const config = loadMcpConfig(input.cwd, input.configPath)
  const server = findMcpServer(config, input.serverName)
  const secrets = getMcpRedactionSecrets(server)
  const client = new StdioMcpClient(server, input.cwd, secrets)

  try {
    await client.connect()
    const tools = await client.listTools()
    const visibleTools = tools.filter((tool) => evaluateMcpToolPolicy(server, tool.name).allowed)
    const blockedTools = tools.filter((tool) => !evaluateMcpToolPolicy(server, tool.name).allowed)
    const audit = createAuditEvent({
      action: 'mcp.tools.list',
      status: 'allowed',
      detail: `Discovered ${visibleTools.length} allowed MCP tool(s) on ${server.name}; ${blockedTools.length} blocked by config policy`,
    })

    return [
      'CodeMind MCP tool discovery',
      '',
      `Server: ${server.name}`,
      `Transport: ${server.transport}`,
      `Policy mode: ${input.policy.mode}`,
      '',
      'Allowed tools:',
      ...(visibleTools.length > 0
        ? visibleTools.map(
            (tool) =>
              `- ${tool.name}${tool.description === undefined ? '' : `: ${tool.description}`}`,
          )
        : ['- None']),
      '',
      'Blocked tools:',
      ...(blockedTools.length > 0 ? blockedTools.map((tool) => `- ${tool.name}`) : ['- None']),
      '',
      '---',
      '',
      renderAuditEvents([audit]),
    ].join('\n')
  } finally {
    client.close()
  }
}

export async function executeMcpTool(input: {
  readonly cwd: string
  readonly policy: RuntimePolicySnapshot
  readonly request: McpToolCallInput
}): Promise<McpToolCallResult> {
  assertShellAllowed(input.policy)
  const config = loadMcpConfig(input.cwd, input.request.configPath)
  const server = findMcpServer(config, input.request.server)
  const decision = evaluateMcpToolPolicy(server, input.request.tool)
  if (!decision.allowed) {
    throw new Error(decision.reason)
  }

  const secrets = getMcpRedactionSecrets(server)
  const client = new StdioMcpClient(server, input.cwd, secrets)

  try {
    await client.connect()
    const result = await client.callTool(input.request.tool, input.request.arguments ?? {})
    return {
      server: server.name,
      tool: input.request.tool,
      rawResult: result,
      redactedResult: redactMcpJson(result, secrets),
    }
  } finally {
    client.close()
  }
}

export async function renderMcpToolExecution(input: {
  readonly cwd: string
  readonly policy: RuntimePolicySnapshot
  readonly request: McpToolCallInput
}): Promise<string> {
  const config = loadMcpConfig(input.cwd, input.request.configPath)
  const server = findMcpServer(config, input.request.server)
  const decision = evaluateMcpToolPolicy(server, input.request.tool)
  const secrets = getMcpRedactionSecrets(server)

  if (!decision.allowed) {
    const audit = createAuditEvent({
      action: 'mcp.tools.call',
      status: 'blocked',
      detail: decision.reason,
    })
    return [
      'CodeMind MCP external tool result',
      '',
      `Server: ${server.name}`,
      `Tool: ${input.request.tool}`,
      'Outcome: BLOCKED',
      `Reason: ${decision.reason}`,
      '',
      '---',
      '',
      renderAuditEvents([audit]),
    ].join('\n')
  }

  try {
    const result = await executeMcpTool(input)
    const audit = createAuditEvent({
      action: 'mcp.tools.call',
      status: 'allowed',
      detail: `Executed MCP tool ${result.tool} on ${result.server}`,
    })

    return [
      'CodeMind MCP external tool result',
      '',
      `Server: ${result.server}`,
      `Tool: ${result.tool}`,
      `Policy mode: ${input.policy.mode}`,
      'Outcome: EXECUTED',
      '',
      'Result:',
      result.redactedResult,
      '',
      'Request arguments:',
      redactMcpJson(input.request.arguments ?? {}, secrets),
      '',
      '---',
      '',
      renderAuditEvents([audit]),
    ].join('\n')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const audit = createAuditEvent({
      action: 'mcp.tools.call',
      status: 'blocked',
      detail: message,
    })

    return [
      'CodeMind MCP external tool result',
      '',
      `Server: ${server.name}`,
      `Tool: ${input.request.tool}`,
      'Outcome: BLOCKED',
      `Reason: ${message}`,
      '',
      'Raw request:',
      redactMcpJson(renderUnknownJson(input.request), secrets),
      '',
      '---',
      '',
      renderAuditEvents([audit]),
    ].join('\n')
  }
}
