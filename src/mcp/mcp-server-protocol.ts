/**
 * JSON-RPC 2.0 dispatch for SymbolWright acting as an MCP *server* — the reverse
 * direction of `mcp-stdio-transport.ts`, which is SymbolWright acting as an MCP
 * *client*. Wire format (newline-delimited JSON-RPC, `initialize` /
 * `notifications/initialized` / `tools/list` / `tools/call`) follows the MCP
 * 2025-11-25 specification, negotiated down to older versions a client may
 * request.
 */

export interface McpServerToolListing {
  readonly name: string
  readonly description: string
  readonly inputSchema: {
    readonly type: 'object'
    readonly properties: Record<string, unknown>
    readonly required?: readonly string[]
  }
}

export interface McpToolCallContent {
  readonly type: 'text'
  readonly text: string
}

export interface McpToolCallResult {
  readonly content: readonly McpToolCallContent[]
  readonly isError?: boolean
}

export interface McpServerToolHandler {
  list(): readonly McpServerToolListing[]
  call(name: string, args: unknown): Promise<McpToolCallResult>
}

export interface McpServerInfo {
  readonly name: string
  readonly version: string
}

export const MCP_SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2024-11-05'] as const
export const MCP_DEFAULT_PROTOCOL_VERSION = '2025-06-18' as const

interface JsonRpcRequestLike {
  readonly jsonrpc?: unknown
  readonly id?: unknown
  readonly method?: unknown
  readonly params?: unknown
}

export interface JsonRpcSuccess {
  readonly jsonrpc: '2.0'
  readonly id: unknown
  readonly result: unknown
}

export interface JsonRpcError {
  readonly jsonrpc: '2.0'
  readonly id: unknown
  readonly error: { readonly code: number; readonly message: string; readonly data?: unknown }
}

const JSON_RPC_METHOD_NOT_FOUND = -32601
const JSON_RPC_INVALID_PARAMS = -32602

function negotiateProtocolVersion(requested: unknown): string {
  if (
    typeof requested === 'string' &&
    (MCP_SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
  ) {
    return requested
  }
  return MCP_DEFAULT_PROTOCOL_VERSION
}

function isRequest(message: JsonRpcRequestLike): boolean {
  return message.id !== undefined
}

function paramsRecord(params: unknown): Record<string, unknown> {
  return typeof params === 'object' && params !== null && !Array.isArray(params)
    ? (params as Record<string, unknown>)
    : {}
}

async function dispatch(
  method: string,
  params: unknown,
  handler: McpServerToolHandler,
  serverInfo: McpServerInfo,
): Promise<{ result: unknown } | { error: { code: number; message: string } }> {
  switch (method) {
    case 'initialize': {
      const protocolVersion = negotiateProtocolVersion(paramsRecord(params)['protocolVersion'])
      return {
        result: {
          protocolVersion,
          capabilities: { tools: {} },
          serverInfo,
        },
      }
    }

    case 'ping':
      return { result: {} }

    case 'tools/list':
      return { result: { tools: handler.list() } }

    case 'tools/call': {
      const record = paramsRecord(params)
      const name = record['name']
      if (typeof name !== 'string' || name.trim().length === 0) {
        return { error: { code: JSON_RPC_INVALID_PARAMS, message: 'params.name must be a string' } }
      }
      // Defense in depth: a misbehaving tool handler must not crash the
      // server process (an uncaught rejection here would kill the long-lived
      // stdio loop for every other tool call in the session).
      try {
        const callResult = await handler.call(name, record['arguments'])
        return { result: callResult }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          result: {
            content: [{ type: 'text', text: `Tool "${name}" failed: ${message}` }],
            isError: true,
          },
        }
      }
    }

    default:
      return { error: { code: JSON_RPC_METHOD_NOT_FOUND, message: `Method not found: ${method}` } }
  }
}

/**
 * Handles one already-JSON-parsed message. Returns a JSON-RPC response for
 * requests (has an `id`), or `undefined` for notifications (no `id`, no
 * response expected — e.g. `notifications/initialized`) and for malformed
 * messages that aren't valid JSON-RPC.
 */
export async function handleMcpServerMessage(
  message: unknown,
  handler: McpServerToolHandler,
  serverInfo: McpServerInfo,
): Promise<JsonRpcSuccess | JsonRpcError | undefined> {
  if (typeof message !== 'object' || message === null) {
    return undefined
  }

  const request = message as JsonRpcRequestLike
  if (typeof request.method !== 'string') {
    return undefined
  }

  const outcome = await dispatch(request.method, request.params, handler, serverInfo)

  if (!isRequest(request)) {
    // Notification: MCP does not expect (or want) a response.
    return undefined
  }

  if ('error' in outcome) {
    return { jsonrpc: '2.0', id: request.id, error: outcome.error }
  }
  return { jsonrpc: '2.0', id: request.id, result: outcome.result }
}
