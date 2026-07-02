import type { RuntimeAuditEvent, RuntimeAuditLog } from '../runtime/audit/runtime-audit-log.js'
import { createAuditEvent } from '../runtime/audit/runtime-audit-log.js'
import type { RuntimePolicySnapshot } from '../runtime/types.js'

import { McpClient, type McpToolContentBlock, type McpToolDescriptor } from './mcp-client.js'
import type { McpConfig, McpServerConfig } from './mcp-config.js'
import { requireMcpServer } from './mcp-config.js'
import { redactMcpText, redactMcpToolResult } from './mcp-redaction.js'
import { assertMcpAllowed } from './mcp-policy.js'

/** Reachability probe result for one configured MCP server. */
export interface McpServerReachability {
  readonly name: string
  readonly command: string
  readonly args: readonly string[]
  readonly reachable: boolean
  readonly toolCount?: number
  readonly error?: string
}

/** Tools discovered from a single MCP server. */
export interface McpToolListing {
  readonly server: string
  readonly tools: readonly McpToolDescriptor[]
}

export type McpCallStatus = 'blocked' | 'unknown_target' | 'ok' | 'tool_error' | 'transport_error'

/** Evidence-shaped record of one `mcp_call` invocation: outcome, transcript, and audit trace. */
export interface McpCallEvidence {
  readonly tool: 'mcp_call'
  readonly server: string
  readonly toolName: string
  readonly status: McpCallStatus
  readonly isError: boolean
  readonly content: readonly McpToolContentBlock[]
  readonly stderrLog: string
  readonly startedAt: string
  readonly finishedAt: string
  readonly durationMs: number
  readonly auditTrace: readonly RuntimeAuditEvent[]
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Probes one server: spawns it, runs the initialize + tools/list handshake, then closes it. */
export async function probeMcpServer(
  server: McpServerConfig,
  policy: RuntimePolicySnapshot,
): Promise<McpServerReachability> {
  const base = { name: server.name, command: server.command, args: server.args }

  try {
    assertMcpAllowed(policy)
  } catch (error) {
    return { ...base, reachable: false, error: errorMessage(error) }
  }

  const client = new McpClient(server)
  try {
    const tools = await client.listTools()
    return { ...base, reachable: true, toolCount: tools.length }
  } catch (error) {
    return { ...base, reachable: false, error: redactMcpText(errorMessage(error)) }
  } finally {
    await client.close()
  }
}

/** Probes every configured server and reports reachability + tool counts. */
export async function listMcpServers(
  config: McpConfig,
  policy: RuntimePolicySnapshot,
): Promise<readonly McpServerReachability[]> {
  const servers = Object.values(config.servers)
  return Promise.all(servers.map((server) => probeMcpServer(server, policy)))
}

/**
 * Discovers tools for one named server, or every configured server when
 * `serverName` is omitted. Throws on policy denial or an unknown server name.
 */
export async function discoverMcpTools(
  config: McpConfig,
  policy: RuntimePolicySnapshot,
  serverName?: string,
): Promise<readonly McpToolListing[]> {
  assertMcpAllowed(policy)

  const targets =
    serverName !== undefined
      ? [requireMcpServer(config, serverName)]
      : Object.values(config.servers)
  const listings: McpToolListing[] = []

  for (const server of targets) {
    const client = new McpClient(server)
    try {
      const tools = await client.listTools()
      listings.push({ server: server.name, tools })
    } finally {
      await client.close()
    }
  }

  return listings
}

export interface McpCallRequest {
  readonly config: McpConfig
  readonly policy: RuntimePolicySnapshot
  readonly server: string
  readonly toolName: string
  readonly arguments: Readonly<Record<string, unknown>>
  readonly timeoutMs?: number
  readonly auditLog?: RuntimeAuditLog
}

/**
 * The single MCP execution path: policy gate -> spawn/connect -> invoke tool ->
 * redact -> audit trace -> evidence-shaped result. Every `mcp_call` — from the
 * CLI or the runtime tool registry — goes through this function.
 */
export async function callMcpTool(request: McpCallRequest): Promise<McpCallEvidence> {
  const startedAt = new Date().toISOString()
  const startedAtMs = Date.now()
  const action = `mcp_call:${request.server}.${request.toolName}`
  const auditTrace: RuntimeAuditEvent[] = []

  const record = (event: RuntimeAuditEvent): void => {
    auditTrace.push(event)
    request.auditLog?.record(event)
  }

  const finish = (
    status: McpCallStatus,
    isError: boolean,
    content: readonly McpToolContentBlock[],
    stderrLog: string,
  ): McpCallEvidence => ({
    tool: 'mcp_call',
    server: request.server,
    toolName: request.toolName,
    status,
    isError,
    content,
    stderrLog,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAtMs,
    auditTrace,
  })

  try {
    assertMcpAllowed(request.policy)
  } catch (error) {
    const message = errorMessage(error)
    record(createAuditEvent({ action, status: 'blocked', detail: message }))
    return finish('blocked', true, [{ type: 'text', text: message }], '')
  }

  let serverConfig: McpServerConfig
  try {
    serverConfig = requireMcpServer(request.config, request.server)
  } catch (error) {
    const message = errorMessage(error)
    record(createAuditEvent({ action, status: 'blocked', detail: message }))
    return finish('unknown_target', true, [{ type: 'text', text: message }], '')
  }

  const client = new McpClient(serverConfig)
  try {
    const rawResult = await client.callTool(request.toolName, request.arguments, request.timeoutMs)
    const redacted = redactMcpToolResult(rawResult)
    const stderrLog = redactMcpText(client.stderrLog)

    record(
      createAuditEvent({
        action,
        status: 'allowed',
        detail: redacted.isError
          ? 'MCP tool call returned isError=true'
          : 'MCP tool call completed',
      }),
    )

    return finish(
      redacted.isError ? 'tool_error' : 'ok',
      redacted.isError,
      redacted.content,
      stderrLog,
    )
  } catch (error) {
    const message = redactMcpText(errorMessage(error))
    const stderrLog = redactMcpText(client.stderrLog)

    record(
      createAuditEvent({ action, status: 'allowed', detail: `MCP transport error: ${message}` }),
    )

    return finish('transport_error', true, [{ type: 'text', text: message }], stderrLog)
  } finally {
    await client.close()
  }
}
