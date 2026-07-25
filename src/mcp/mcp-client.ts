import type { McpServerConfig } from './mcp-config.js'
import { McpStdioTransport, type JsonRpcResponse } from './mcp-stdio-transport.js'

/** A tool advertised by an MCP server via `tools/list`. */
export interface McpToolDescriptor {
  readonly name: string
  readonly description?: string
  readonly inputSchema?: unknown
}

/** A single content block inside a `tools/call` result. */
export interface McpToolContentBlock {
  readonly type: string
  readonly text?: string
}

/** Result of a `tools/call` invocation. */
export interface McpToolCallResult {
  readonly content: readonly McpToolContentBlock[]
  readonly isError: boolean
}

const CLIENT_PROTOCOL_VERSION = '2024-11-05'
const CLIENT_INFO = { name: 'symbolwright', version: '0.2.0' } as const

function unwrapResult(response: JsonRpcResponse, method: string): unknown {
  if ('error' in response) {
    throw new Error(
      `MCP server error on ${method}: ${response.error.message} (code ${response.error.code})`,
    )
  }
  return response.result
}

/**
 * High-level MCP client for a single stdio server: handshake, tool discovery,
 * and tool invocation. One instance owns one spawned process.
 */
export class McpClient {
  private readonly transport: McpStdioTransport
  private readonly timeoutMs: number
  private initialized = false

  constructor(server: McpServerConfig, transport?: McpStdioTransport) {
    this.transport =
      transport ??
      new McpStdioTransport({
        command: server.command,
        args: server.args,
        env: server.env,
        ...(server.cwd !== undefined ? { cwd: server.cwd } : {}),
      })
    this.timeoutMs = server.timeoutMs
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    const response = await this.transport.request(
      'initialize',
      { protocolVersion: CLIENT_PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
      this.timeoutMs,
    )
    unwrapResult(response, 'initialize')
    this.transport.notify('notifications/initialized')
    this.initialized = true
  }

  async listTools(): Promise<readonly McpToolDescriptor[]> {
    await this.initialize()
    const response = await this.transport.request('tools/list', {}, this.timeoutMs)
    const result = unwrapResult(response, 'tools/list') as { tools?: unknown }

    if (!Array.isArray(result.tools)) {
      throw new Error('MCP server returned a malformed tools/list result')
    }
    return result.tools as readonly McpToolDescriptor[]
  }

  async callTool(
    name: string,
    args: Readonly<Record<string, unknown>>,
    timeoutMs?: number,
  ): Promise<McpToolCallResult> {
    await this.initialize()
    const response = await this.transport.request(
      'tools/call',
      { name, arguments: args },
      timeoutMs ?? this.timeoutMs,
    )
    const result = unwrapResult(response, 'tools/call') as {
      content?: unknown
      isError?: unknown
    }
    const content = Array.isArray(result.content) ? (result.content as McpToolContentBlock[]) : []

    return { content, isError: result.isError === true }
  }

  /** Captured stderr output from the server process, for diagnostics/audit. */
  get stderrLog(): string {
    return this.transport.stderrLog
  }

  async close(): Promise<void> {
    await this.transport.close()
  }
}
