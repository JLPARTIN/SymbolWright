export const MCP_PROTOCOL_VERSION = '2024-11-05' as const
export const DEFAULT_MCP_CONFIG_PATH = '.codemind/mcp.json' as const
export const DEFAULT_MCP_TIMEOUT_MS = 5_000 as const

export type McpTransport = 'stdio'

export interface McpServerConfig {
  readonly name: string
  readonly transport: McpTransport
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly timeoutMs: number
  readonly allowedTools?: readonly string[]
  readonly blockedTools: readonly string[]
}

export interface McpConfig {
  readonly configPath: string
  readonly servers: readonly McpServerConfig[]
}

export interface McpToolDescriptor {
  readonly name: string
  readonly description?: string
  readonly inputSchema?: unknown
}

export interface McpToolsListResult {
  readonly tools: readonly McpToolDescriptor[]
}

export interface McpToolCallInput {
  readonly server: string
  readonly tool: string
  readonly arguments?: Readonly<Record<string, unknown>>
  readonly configPath?: string
}

export interface McpToolPolicyDecision {
  readonly allowed: boolean
  readonly reason: string
}

export interface McpToolCallResult {
  readonly server: string
  readonly tool: string
  readonly rawResult: unknown
  readonly redactedResult: string
}

export interface McpServerListEntry {
  readonly name: string
  readonly transport: McpTransport
  readonly command: string
  readonly toolPolicy: string
}
